"use client";

import { Brain, ChevronRight, ListChecks, MoonStar, Plus, Zap } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { Section } from "@/components/common/bits";
import { addDays, hhmmToMinutes, minutesToHHMM } from "@/lib/dates";
import { energySuggestions } from "@/lib/energy";
import type { Task } from "@/lib/types";
import { useBusySpans } from "@/hooks/use-day-busy";
import { useUI } from "@/store/ui";
import { routineDueOn, runProgress, shutdownDue } from "@/lib/org";
import { cn } from "@/lib/utils";
import { useMe, useMyTasks, useNowMinutes, useRoutines, useToday, useTz, useUserId } from "@/store/hooks";
import { useStore } from "@/store/store";

/** After the chosen time, a nudge to close the day (Settings → «Kunni yakunlash»). */
export function ShutdownCard() {
  const t = useTranslations("shutdown");
  const me = useMe();
  const uid = useUserId();
  const today = useToday();
  const now = useNowMinutes();
  const shutdowns = useStore((s) => s.data.daily_shutdowns);
  const done = useMemo(() => Object.values(shutdowns).some((r) => r.user_id === uid && r.date === today && r.completed_at), [shutdowns, uid, today]);
  if (!me || !shutdownDue(me, minutesToHHMM(now), done)) return null;
  return (
    <Link href="/shutdown" className="flex items-center gap-3 rounded-2xl border border-brand/30 bg-brand-soft/60 p-3.5 transition-colors hover:bg-brand-soft">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-card text-brand"><MoonStar className="size-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{t("homeTitle")}</span>
        <span className="block text-13 text-muted-foreground">{t("homeBody")}</span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" />
    </Link>
  );
}

/** Today's routines with their progress; a tap opens the routines page. */
export function RoutinesRow() {
  const t = useTranslations("routines");
  const routines = useRoutines();
  const runs = useStore((s) => s.data.routine_runs);
  const today = useToday();
  const tz = useTz();
  const list = useMemo(() => routines.filter((r) => routineDueOn(r, today, tz)), [routines, today, tz]);
  if (routines.length === 0) {
    return (
      <Link href="/routines" className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-3 text-13 text-muted-foreground hover:border-brand hover:text-brand-fg">
        <Plus className="size-4" /> {t("homeEmpty")}
      </Link>
    );
  }
  if (list.length === 0) return null;
  return (
    <Section title={t("title")}>
      <ul className="space-y-1.5">
        {list.map((r) => {
          const run = Object.values(runs).find((x) => x.routine_id === r.id && x.date === today);
          const { done, total } = runProgress(r, run);
          const complete = total > 0 && done === total;
          return (
            <li key={r.id}>
              <Link href="/routines" data-color={r.color} className="flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 text-13 hover:bg-muted/50">
                <ListChecks className={cn("size-4 shrink-0", complete ? "text-success-fg" : "text-pc")} />
                <span className={cn("min-w-0 flex-1 truncate font-medium", complete && "text-muted-foreground line-through")}>{r.name}</span>
                <span className="text-xs text-muted-foreground tnum">{t("progress", { done, total })}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** «Hozir nima qilay?»: deep work for the morning block, quick tasks that fit the next free gap. */
export function EnergyCard() {
  const t = useTranslations("energy");
  const today = useToday();
  const now = useNowMinutes();
  const me = useMe();
  const mine = useMyTasks();
  const busy = useBusySpans(today);
  const openTask = useUI((s) => s.openTask);
  const s = useMemo(
    () => energySuggestions(mine, { today, nowMin: now, dayEnd: hhmmToMinutes(me?.day_end ?? "22:00"), busy, horizon: addDays(today, 7) }),
    [mine, today, now, me?.day_end, busy],
  );
  if (!mine.some((x) => x.energy)) return null;
  if (!s.deep.length && !s.quick.length) return null;
  const row = (task: Task, icon: React.ReactNode) => (
    <li key={task.id}>
      <button type="button" onClick={() => openTask(task.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-13 hover:bg-muted">
        {icon}
        <span className="min-w-0 flex-1 truncate">{task.title}</span>
        {task.estimate_min && <span className="shrink-0 text-xs text-muted-foreground tnum">{task.estimate_min}′</span>}
      </button>
    </li>
  );
  return (
    <Section title={t("cardTitle")}>
      <div className="space-y-3 rounded-2xl border bg-card p-3 shadow-elev-1">
        {s.deep.length > 0 && (
          <div>
            <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">{t("morning")}</p>
            <ul>{s.deep.map((x) => row(x, <Brain className="size-3.5 shrink-0 text-[var(--pc-violet-fg)]" aria-hidden />))}</ul>
          </div>
        )}
        {s.quick.length > 0 && s.gap && (
          <div>
            <p className="mb-1 px-2 text-xs font-medium text-muted-foreground tnum">{t("gap", { from: minutesToHHMM(s.gap.start), to: minutesToHHMM(s.gap.end) })}</p>
            <ul>{s.quick.map((x) => row(x, <Zap className="size-3.5 shrink-0 text-[var(--pc-amber-fg)]" aria-hidden />))}</ul>
          </div>
        )}
      </div>
    </Section>
  );
}
