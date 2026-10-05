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
import { addDays, eachDay, isoWeekday, startOfWeek } from "@/lib/dates";
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
        <div className="grid gap-4 md:grid-cols-2">
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

  return (
    <article data-color={safeColor(habit.color)} className="rounded-2xl border bg-card p-4 shadow-elev-1">
      <header className="flex items-center gap-3">
        <button
          onClick={() => toggleHabit(habit.id, today)}
          disabled={!scheduledOn(habit, today) && !doneToday}
          aria-pressed={doneToday}
          aria-label={t("habits.checkIn")}
          className={cn("flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-pc transition-all duration-200 disabled:opacity-40", doneToday ? "bg-pc text-white" : "text-pc hover:bg-pc-soft")}
        >
          <Check className="size-5" strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-sans text-base font-semibold tracking-normal">{habit.name}</h2>
          <p className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Flame className="size-3.5 text-pc" /> {t("habits.streak", { count: streak })}</span>
            <span className="inline-flex items-center gap-1"><Trophy className="size-3.5" /> {t("habits.best", { count: best })}</span>
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label={t("habits.archive")} onClick={() => updateHabit(habit.id, { archived_at: new Date().toISOString() })}>
          <Archive />
        </Button>
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
        <div className="flex gap-[3px]" role="grid" aria-label={t("habits.heatmap")}>
          {cols.map((col, i) => (
            <div key={i} className="flex flex-col gap-[3px]" role="row">
              {col.map((d) => {
                const on = done.has(d);
                return (
                  <span
                    key={d}
                    role="gridcell"
                    title={`${f.dayMonth(d)}${on ? " ✓" : ""}`}
                    aria-label={`${f.dayMonth(d)} ${on ? "✓" : "—"}`}
                    className={cn("size-3 rounded-[3px] sm:size-3.5", d > today ? "bg-transparent" : on ? "bg-pc" : scheduledOn(habit, d) ? "bg-muted" : "bg-muted/40")}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
