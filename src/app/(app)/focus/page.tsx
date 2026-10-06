"use client";

import { Coffee, Pause, Play, SkipForward, Square, Timer } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useMemo, useState } from "react";
import { PageHeader, ProjectDot } from "@/components/common/bits";
import { PageContainer } from "@/components/shell/app-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { startOfWeek } from "@/lib/dates";
import { focusSummary } from "@/lib/focus-stats";
import { byDueThenPriority } from "@/lib/filters";
import { useFormat } from "@/lib/format";
import { isOpen } from "@/lib/health";
import { cn } from "@/lib/utils";
import { updateProfile } from "@/store/actions";
import { useFocus } from "@/store/focus";
import { useMe, useMyTasks, useToday, useTz, useUserId } from "@/store/hooks";
import { useStore } from "@/store/store";

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function FocusInner() {
  const t = useTranslations();
  const params = useSearchParams();
  const me = useMe();
  const uid = useUserId();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const mine = useMyTasks();
  const projects = useStore((s) => s.data.projects);
  const entries = useStore((s) => s.data.time_entries);
  const focus = useFocus();
  const now = useNow(focus.running);
  const workMin = me?.pomodoro_work ?? 25;
  const breakMin = me?.pomodoro_break ?? 5;

  useEffect(() => {
    const id = params.get("task");
    if (id && !focus.running) focus.setTask(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const candidates = useMemo(() => mine.filter(isOpen).sort(byDueThenPriority).slice(0, 60), [mine]);
  const task = focus.taskId ? mine.find((x) => x.id === focus.taskId) ?? useStore.getState().data.tasks[focus.taskId] : undefined;
  const remaining = focus.running && focus.endsAt ? focus.endsAt - now : (focus.remainingMs ?? (focus.phase === "work" ? workMin : breakMin) * 60_000);
  const planned = focus.running || focus.remainingMs !== null ? focus.plannedMs : (focus.phase === "work" ? workMin : breakMin) * 60_000;
  const progress = 1 - remaining / planned;
  const idle = !focus.running && focus.remainingMs === null;
  // finished sessions only, from the same rows the Home card reads
  const todayFocus = useMemo(() => focusSummary(Object.values(entries), uid, tz, today, today), [entries, uid, tz, today]);
  const weekFocus = useMemo(() => focusSummary(Object.values(entries), uid, tz, startOfWeek(today), today), [entries, uid, tz, today]);

  const R = 120;
  const C = 2 * Math.PI * R;

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        title={t("focus.title")}
        subtitle={t("focus.subtitle")}
        icon={<span className="flex size-9 items-center justify-center rounded-xl bg-[var(--pc-violet-soft)] text-[var(--pc-violet-fg)]"><Timer className="size-5" /></span>}
      />
      <div className="flex flex-col items-center gap-6 rounded-3xl border bg-card p-6 shadow-elev-2 sm:p-10">
        <div className="w-full max-w-md">
          <Select value={focus.taskId ?? "none"} onValueChange={(v) => focus.setTask(v === "none" ? null : v)} disabled={focus.running}>
            <SelectTrigger className="h-11 w-full bg-background" aria-label={t("focus.pickTask")}>
              <SelectValue placeholder={t("focus.pickTask")} />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              <SelectItem value="none">{t("focus.noTask")}</SelectItem>
              {candidates.map((x) => (
                <SelectItem key={x.id} value={x.id}>
                  {x.project_id && <ProjectDot color={projects[x.project_id]?.color} size="sm" />}
                  <span className="truncate">{x.title}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="relative" role="timer" aria-live="off" aria-label={`${focus.phase === "work" ? t("focus.work") : t("focus.break")} ${formatClock(remaining)}`}>
          <svg width="280" height="280" viewBox="0 0 280 280" className="-rotate-90">
            <circle cx="140" cy="140" r={R} fill="none" stroke="var(--muted)" strokeWidth="10" />
            <circle
              cx="140"
              cy="140"
              r={R}
              fill="none"
              stroke={focus.phase === "work" ? "var(--brand)" : "var(--success)"}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - Math.max(0, Math.min(1, progress)))}
              className="transition-[stroke-dashoffset] duration-300 ease-linear"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn("mb-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", focus.phase === "work" ? "bg-brand-soft text-brand-fg" : "bg-success-soft text-success-fg")}>
              {focus.phase === "work" ? <Timer className="size-3.5" /> : <Coffee className="size-3.5" />}
              {focus.phase === "work" ? t("focus.work") : t("focus.break")}
            </span>
            <span className="font-display text-6xl font-bold tnum-fixed">{formatClock(remaining)}</span>
            {task && <span className="mt-2 max-w-52 truncate text-13 text-muted-foreground">{task.title}</span>}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {idle ? (
            <Button size="lg" className="h-12 min-w-36 rounded-full text-base" onClick={() => focus.start(workMin, breakMin)}>
              <Play /> {t("focus.start")}
            </Button>
          ) : focus.running ? (
            <Button size="lg" variant="secondary" className="h-12 min-w-36 rounded-full text-base" onClick={focus.pause}>
              <Pause /> {t("focus.pause")}
            </Button>
          ) : (
            <Button size="lg" className="h-12 min-w-36 rounded-full text-base" onClick={focus.resume}>
              <Play /> {t("focus.resume")}
            </Button>
          )}
          {!idle && (
            <Button size="lg" variant="outline" className="h-12 rounded-full" onClick={focus.stop}>
              <Square /> {t("focus.stop")}
            </Button>
          )}
          {focus.phase === "break" && (
            <Button size="lg" variant="ghost" className="h-12 rounded-full" onClick={focus.skipBreak}>
              <SkipForward /> {t("focus.skipBreak")}
            </Button>
          )}
        </div>

        <div className="grid w-full max-w-md grid-cols-2 gap-3 border-t pt-5">
          <div className="space-y-2">
            <div>
              <p className="text-xs text-muted-foreground">{t("focus.today")}</p>
              <p className="text-xl font-semibold tnum">{f.duration(todayFocus.minutes)}</p>
              <p className="text-xs text-muted-foreground">{t("focus.sessions", { count: todayFocus.sessions })}</p>
            </div>
            <p className="text-xs text-muted-foreground tnum">
              {t("focus.thisWeek")}: {f.duration(weekFocus.minutes)} · {t("focus.sessions", { count: weekFocus.sessions })}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="pw" className="text-xs">{t("focus.workMinutes")}</Label>
              <Input id="pw" type="number" min={5} max={120} defaultValue={workMin} key={workMin} disabled={!idle} onBlur={(e) => updateProfile({ pomodoro_work: Math.max(5, Math.min(120, Number(e.target.value) || 25)) })} className="h-8 tnum" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pb" className="text-xs">{t("focus.breakMinutes")}</Label>
              <Input id="pb" type="number" min={1} max={60} defaultValue={breakMin} key={breakMin} disabled={!idle} onBlur={(e) => updateProfile({ pomodoro_break: Math.max(1, Math.min(60, Number(e.target.value) || 5)) })} className="h-8 tnum" />
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}

export default function FocusPage() {
  return (
    <Suspense>
      <FocusInner />
    </Suspense>
  );
}
