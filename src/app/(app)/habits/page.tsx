"use client";

import { Archive, Check, Flame, Lock, Plus, Sprout, Trophy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/common/bits";
import { EmptyState } from "@/components/common/empty-state";
import { PageContainer } from "@/components/shell/app-client";
import { ColorPicker } from "@/components/tasks/pickers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeColor } from "@/lib/colors";
import { addDays, dateIn, eachDay, isoWeekday, startOfWeek } from "@/lib/dates";
import { useFormat } from "@/lib/format";
import { bestStreak, currentStreak, scheduledOn } from "@/lib/habits";
import type { Habit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { createHabit, toggleHabit, updateHabit } from "@/store/actions";
import { useToday, useTz, useUserId } from "@/store/hooks";
import { useStore } from "@/store/store";

export default function HabitsPage() {
  const t = useTranslations();
  const uid = useUserId();
  const habits = useStore((s) => s.data.habits);
  const logs = useStore((s) => s.data.habit_logs);
  const today = useToday();
  const list = useMemo(() => Object.values(habits).filter((h) => h.user_id === uid && !h.archived_at).sort((a, b) => a.position - b.position), [habits, uid]);
  const doneBy = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of Object.values(logs)) {
      if (!m.has(l.habit_id)) m.set(l.habit_id, new Set());
      m.get(l.habit_id)!.add(l.date);
    }
    return m;
  }, [logs]);
  const [adding, setAdding] = useState(false);

  return (
    <PageContainer>
      <PageHeader
        title={t("habits.title")}
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3.5" /> {t("habits.subtitle")}
          </span>
        }
        icon={<span className="flex size-9 items-center justify-center rounded-xl bg-success-soft text-success-fg"><Sprout className="size-5" /></span>}
        actions={<Button size="sm" onClick={() => setAdding(true)}><Plus /> {t("habits.new")}</Button>}
      />
      {adding && <NewHabit onDone={() => setAdding(false)} />}
      {list.length === 0 && !adding ? (
        <EmptyState illustration="sprout" title={t("habits.empty")} body={t("habits.emptyBody")} action={<Button onClick={() => setAdding(true)}><Plus /> {t("habits.new")}</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {list.map((h) => (
            <HabitCard key={h.id} habit={h} done={doneBy.get(h.id) ?? new Set()} today={today} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}

function NewHabit({ onDone }: { onDone: () => void }) {
  const t = useTranslations();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const [name, setName] = useState("");
  const [color, setColor] = useState("emerald");
  const [days, setDays] = useState([1, 2, 3, 4, 5, 6, 7]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || days.length === 0) return;
        createHabit(name, color, days);
        onDone();
      }}
      className="mb-5 space-y-3 rounded-2xl border bg-card p-4 shadow-elev-1"
    >
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("habits.namePlaceholder")} aria-label={t("common.name")} />
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("habits.days")}>
        {f.weekdaysShort.map((d, i) => {
          const dow = i + 1;
          const on = days.includes(dow);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              onClick={() => setDays(on ? days.filter((x) => x !== dow) : [...days, dow].sort())}
              className={cn("size-9 rounded-full border text-xs font-semibold", on ? "border-brand bg-brand-soft text-brand-fg" : "text-muted-foreground")}
            >
              {d}
            </button>
          );
        })}
      </div>
      <ColorPicker value={color} onChange={setColor} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>{t("common.cancel")}</Button>
        <Button type="submit" disabled={!name.trim()}>{t("common.create")}</Button>
      </div>
    </form>
  );
}

const HEAT = {
  future: "bg-transparent",
  done: "bg-pc",
  missed: "bg-border-strong/70",
  off: "bg-muted",
  before: "border border-dashed border-border-strong bg-transparent",
} as const;

function HabitCard({ habit, done, today }: { habit: Habit; done: Set<string>; today: string }) {
  const t = useTranslations();
  const tz = useTz();
  const f = useFormat(today, tz);
  const weekStart = startOfWeek(today);
  const week = eachDay(weekStart, addDays(weekStart, 6));
  const streak = currentStreak(habit, done, today);
  const heatStart = addDays(weekStart, -15 * 7);
  const best = bestStreak(habit, done, heatStart, today);
  const cols: string[][] = [];
  for (let w = 0; w < 16; w++) cols.push(eachDay(addDays(heatStart, w * 7), addDays(heatStart, w * 7 + 6)));
  const doneToday = done.has(today);
  const createdOn = dateIn(tz, habit.created_at);
  // month label above the first column of each month
  // a label needs ~3 columns of room, so a month starting right after the first column hides the first label
  const monthLabels: string[] = [];
  let lastLabelAt = -10;
  cols.forEach((col, i) => {
    const firstOfMonth = col.find((d) => d.endsWith("-01"));
    const month = i === 0 && !cols.slice(1, 3).some((c) => c.some((d) => d.endsWith("-01"))) ? col[0] : firstOfMonth;
    if (month && i - lastLabelAt >= 3) {
      monthLabels.push(f.monthsShort[Number(month.slice(5, 7)) - 1]);
      lastLabelAt = i;
    } else monthLabels.push("");
  });
  const cellState = (d: string): "future" | "before" | "done" | "missed" | "off" => {
    if (d > today) return "future";
    if (done.has(d)) return "done";
    if (d < createdOn) return "before";
    return scheduledOn(habit, d) ? "missed" : "off";
  };

  return (
    <article data-color={safeColor(habit.color)} className="rounded-2xl border bg-card p-4 shadow-elev-1">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-sans text-base font-semibold tracking-normal break-words">{habit.name}</h2>
          <p className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Flame className="size-3.5 text-pc" /> {t("habits.streak", { count: streak })}</span>
            <span className="inline-flex items-center gap-1"><Trophy className="size-3.5" /> {t("habits.best", { count: best })}</span>
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label={t("habits.archive")} onClick={() => updateHabit(habit.id, { archived_at: new Date().toISOString() })}>
          <Archive />
        </Button>
        <button
          type="button"
          onClick={() => toggleHabit(habit.id, today)}
          disabled={!scheduledOn(habit, today) && !doneToday}
          aria-pressed={doneToday}
          className={cn(
            "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-pc px-4 text-sm font-semibold transition-colors duration-200 disabled:opacity-40",
            doneToday ? "bg-pc text-white" : "text-pc-fg hover:bg-pc-soft",
          )}
        >
          <Check className="size-4" strokeWidth={3} aria-hidden />
          {doneToday ? t("habits.doneToday") : scheduledOn(habit, today) ? t("habits.markToday") : t("habits.notToday")}
        </button>
      </header>

      <div className="mt-4">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("habits.thisWeek")}</p>
        <div className="grid grid-cols-7 gap-1.5">
          {week.map((d) => {
            const on = done.has(d);
            const scheduled = scheduledOn(habit, d);
            const future = d > today;
            return (
              <button
                key={d}
                disabled={future}
                onClick={() => toggleHabit(habit.id, d)}
                aria-pressed={on}
                aria-label={f.longDay(d)}
                className={cn(
                  "flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl border text-2xs font-medium transition-colors disabled:opacity-40",
                  on ? "border-transparent bg-pc text-white" : scheduled ? "hover:border-pc" : "border-dashed text-subtle-foreground",
                  d === today && !on && "border-pc",
                )}
              >
                {f.weekdaysShort[isoWeekday(d) - 1]}
                <span className="tnum">{Number(d.slice(8))}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("habits.heatmap")}</p>
        <div className="flex gap-1.5 overflow-x-auto">
          <div className="flex flex-col gap-[3px] pt-4 text-[10px] leading-3 text-muted-foreground" aria-hidden>
            {f.weekdaysShort.map((d, i) => (
              <span key={d} className="h-3 sm:h-3.5">{i % 2 === 0 ? d : ""}</span>
            ))}
          </div>
          <div>
            <div className="flex gap-[3px] text-[10px] leading-4 text-muted-foreground" aria-hidden>
              {monthLabels.map((m, i) => (
                <span key={i} className="w-3 overflow-visible whitespace-nowrap sm:w-3.5">{m}</span>
              ))}
            </div>
            <div className="flex gap-[3px]" role="grid" aria-label={t("habits.heatmap")}>
              {cols.map((col, i) => (
                <div key={i} className="flex flex-col gap-[3px]" role="row">
                  {col.map((d) => {
                    const state = cellState(d);
                    return (
                      <span
                        key={d}
                        role="gridcell"
                        title={`${f.dayMonth(d)} · ${t(`habits.cell.${state}`)}`}
                        aria-label={`${f.dayMonth(d)}: ${t(`habits.cell.${state}`)}`}
                        className={cn("size-3 rounded-[3px] sm:size-3.5", HEAT[state])}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {(["done", "missed", "off", "before"] as const).map((k) => (
            <li key={k} className="inline-flex items-center gap-1">
              <span className={cn("size-2.5 rounded-[3px]", HEAT[k])} aria-hidden /> {t(`habits.cell.${k}`)}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
