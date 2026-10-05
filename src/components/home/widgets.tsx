"use client";

import { AlertTriangle, ArrowDownRight, ArrowUpRight, Check, CheckCircle2, Flame, Moon, Plus, Star, Timer } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { ProjectDot } from "@/components/common/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { safeColor } from "@/lib/colors";
import { addDays, dateIn, startOfWeek } from "@/lib/dates";
import { useFormat } from "@/lib/format";
import { currentStreak, scheduledOn } from "@/lib/habits";
import { isOpen, suggestHealth, effectiveHealth } from "@/lib/health";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { setTop, toggleHabit } from "@/store/actions";
import { tasksByProject, useMyTasks, useProjects, useToday, useTz, useUserId } from "@/store/hooks";
import { useStore } from "@/store/store";
import { toast } from "sonner";

export function HabitsRow() {
  const t = useTranslations("habits");
  const th = useTranslations("home");
  const today = useToday();
  const uid = useUserId();
  const habits = useStore((s) => s.data.habits);
  const logs = useStore((s) => s.data.habit_logs);
  const list = useMemo(() => Object.values(habits).filter((h) => h.user_id === uid && !h.archived_at && scheduledOn(h, today)).sort((a, b) => a.position - b.position), [habits, uid, today]);
  const doneBy = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of Object.values(logs)) {
      if (!m.has(l.habit_id)) m.set(l.habit_id, new Set());
      m.get(l.habit_id)!.add(l.date);
    }
    return m;
  }, [logs]);

  if (list.length === 0) {
    return (
      <Link href="/habits" className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-3 text-13 text-muted-foreground hover:border-brand hover:text-brand-fg">
        <Plus className="size-4" /> {th("habitsEmpty")}
      </Link>
    );
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {list.map((h) => {
        const set = doneBy.get(h.id) ?? new Set<string>();
        const done = set.has(today);
        const streak = currentStreak(h, set, today);
        return (
          <li key={h.id}>
            <button
              onClick={() => toggleHabit(h.id, today)}
              aria-pressed={done}
              data-color={safeColor(h.color)}
              className={cn(
                "flex h-10 items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-13 font-medium transition-all duration-200",
                done ? "border-transparent bg-pc text-white shadow-elev-1" : "bg-card hover:border-pc",
              )}
            >
              <span className={cn("flex size-8 items-center justify-center rounded-full", done ? "bg-white/25" : "bg-pc-soft text-pc-fg")}>
                {done ? <Check className="size-4" strokeWidth={3} /> : <span className="size-2.5 rounded-full bg-pc" />}
              </span>
              {h.name}
              {streak > 0 && (
                <span className={cn("inline-flex items-center gap-0.5 text-xs tnum", done ? "text-white/90" : "text-muted-foreground")} title={t("streak", { count: streak })}>
                  <Flame className="size-3" /> {streak}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function StatsCards() {
  const t = useTranslations();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const uid = useUserId();
  const mine = useMyTasks();
  const entries = useStore((s) => s.data.time_entries);
  const tasks = useStore((s) => s.data.tasks);
  const projects = useProjects();

  const weekStart = startOfWeek(today);
  const lastWeekStart = addDays(weekStart, -7);
  const stats = useMemo(() => {
    let thisWeek = 0;
    let lastWeek = 0;
    for (const x of mine) {
      if (x.status !== "done" || !x.completed_at) continue;
      const d = dateIn(tz, x.completed_at);
      if (d >= weekStart) thisWeek++;
      else if (d >= lastWeekStart) lastWeek++;
    }
    const focus = Object.values(entries)
      .filter((e) => e.user_id === uid && dateIn(tz, e.started_at) >= weekStart)
      .reduce((n, e) => n + e.minutes, 0);
    const byProject = tasksByProject(tasks);
    const atRisk = projects
      .filter((p) => p.status === "active")
      .map((p) => ({ p, h: effectiveHealth(p, suggestHealth(p, byProject[p.id] ?? [], today).health) }))
      .filter((r) => r.h !== "on_track");
    return { thisWeek, lastWeek, focus, atRisk };
  }, [mine, entries, uid, tz, weekStart, lastWeekStart, tasks, projects, today]);

  const delta = stats.thisWeek - stats.lastWeek;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-1 xl:grid-cols-2">
      <div className="rounded-2xl border bg-card p-4 shadow-elev-1">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <CheckCircle2 className="size-3.5 text-success" /> {t("home.doneThisWeek")}
        </p>
        <p className="mt-1.5 flex items-baseline gap-2 font-display text-28 leading-none font-bold tnum">
          {stats.thisWeek}
          {delta !== 0 && (
            <span className={cn("inline-flex items-center text-xs font-semibold", delta > 0 ? "text-success-fg" : "text-danger-fg")}>
              {delta > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
              {Math.abs(delta)}
            </span>
          )}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{t("home.vsLastWeek", { count: stats.lastWeek })}</p>
      </div>
      <Link href="/focus" className="rounded-2xl border bg-card p-4 shadow-elev-1 transition-shadow hover:shadow-elev-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Timer className="size-3.5 text-violet-500" style={{ color: "var(--pc-violet)" }} /> {t("home.focusTime")}
        </p>
        <p className="mt-1.5 font-display text-28 leading-none font-bold tnum">{stats.focus ? f.duration(stats.focus) : "0"}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("home.focusThisWeek")}</p>
      </Link>
      <div className="col-span-2 rounded-2xl border bg-card p-4 shadow-elev-1 lg:col-span-1 xl:col-span-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <AlertTriangle className="size-3.5 text-warning" /> {t("home.atRisk")}
        </p>
        {stats.atRisk.length === 0 ? (
          <p className="mt-1.5 text-sm font-medium text-success-fg">{t("home.atRiskNone")}</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {stats.atRisk.slice(0, 4).map(({ p, h }) => (
              <li key={p.id}>
                <Link href={`/projects/${p.id}?view=overview`} className="flex items-center gap-2 rounded-md py-0.5 text-13 hover:underline">
                  <ProjectDot color={p.color} size="sm" />
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className={cn("text-xs font-semibold", h === "off_track" ? "text-danger-fg" : "text-warning-fg")}>{t(`health.${h}`)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function PlanTomorrow({ evening }: { evening: boolean }) {
  const t = useTranslations();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const tomorrow = addDays(today, 1);
  const mine = useMyTasks();
  const projects = useStore((s) => s.data.projects);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const alreadyPlanned = useMemo(() => mine.filter((x) => x.top_date === tomorrow && isOpen(x)), [mine, tomorrow]);
  const shortlist = useMemo(() => {
    const score = (x: Task) =>
      (x.due_date === tomorrow ? 50 : 0) + (x.due_date && x.due_date < tomorrow ? 40 : 0) + ({ urgent: 30, high: 20, medium: 10, low: 0, none: 0 }[x.priority]) + (x.deadline && x.deadline <= addDays(today, 3) ? 25 : 0) + (x.top_date === today ? 15 : 0);
    return mine
      .filter((x) => isOpen(x) && !x.parent_id)
      .map((x) => ({ x, s: score(x) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 10)
      .map((r) => r.x);
  }, [mine, tomorrow, today]);

  if (!evening && alreadyPlanned.length === 0) return null;

  function save() {
    for (const x of mine.filter((m) => m.top_date === tomorrow && !picked.includes(m.id))) setTop(x, false);
    for (const id of picked) {
      const x = mine.find((m) => m.id === id);
      if (x && x.top_date !== tomorrow) setTop(x, true, tomorrow);
    }
    toast.success(t("home.planTomorrowSaved"));
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => {
          setPicked(alreadyPlanned.map((x) => x.id));
          setOpen(true);
        }}
        className="group flex w-full items-center gap-3 rounded-2xl border bg-[linear-gradient(135deg,var(--pc-indigo-soft),var(--pc-violet-soft))] p-4 text-left shadow-elev-1 transition-shadow hover:shadow-elev-2"
      >
        <span className="flex size-10 items-center justify-center rounded-xl bg-card text-[var(--pc-indigo)] shadow-elev-1">
          <Moon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{t("home.planTomorrow")}</span>
          <span className="block text-xs text-muted-foreground">
            {alreadyPlanned.length ? alreadyPlanned.map((x) => x.title).join(" · ") : t("home.planTomorrowBody")}
          </span>
        </span>
        <span className="text-xs font-semibold text-muted-foreground tnum">{alreadyPlanned.length}/3</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("home.planTomorrow")} · {f.longDay(tomorrow)}</DialogTitle>
            <DialogDescription>{t("home.planTomorrowBody")}</DialogDescription>
          </DialogHeader>
          <p className="text-xs font-semibold text-muted-foreground">{t("home.planTomorrowSuggested")}</p>
          <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
            {shortlist.map((x) => {
              const on = picked.includes(x.id);
              const p = x.project_id ? projects[x.project_id] : undefined;
              return (
                <li key={x.id}>
                  <button
                    onClick={() => setPicked((cur) => (on ? cur.filter((i) => i !== x.id) : cur.length >= 3 ? cur : [...cur, x.id]))}
                    aria-pressed={on}
                    disabled={!on && picked.length >= 3}
                    className={cn("flex w-full items-center gap-3 rounded-xl border p-2.5 text-left text-sm transition-colors disabled:opacity-40", on ? "border-warning bg-warning-soft" : "hover:bg-muted")}
                  >
                    <Star className={cn("size-4 shrink-0", on ? "fill-warning text-warning" : "text-muted-foreground")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{x.title}</span>
                      {p && <span className="block truncate text-xs text-muted-foreground">{p.name}</span>}
                    </span>
                    {x.due_date && <span className="text-xs text-muted-foreground tnum">{f.relativeDay(x.due_date)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <DialogFooter className="items-center sm:justify-between">
            <span className="text-xs text-muted-foreground tnum">{t("home.planTomorrowPicked", { count: picked.length })}</span>
            <Button onClick={save}>{t("home.planTomorrowSave")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
