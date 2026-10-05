// Report metrics, computed from task rows in the user's time zone. Pure and unit-tested.

import { addDays, dateIn, startOfWeek } from "./dates";
import type { ISODate, Task, TimeEntry } from "./types";

export interface WeekBucket {
  start: ISODate;
  end: ISODate;
}

export function lastWeeks(today: ISODate, n: number): WeekBucket[] {
  const current = startOfWeek(today);
  const out: WeekBucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = addDays(current, -7 * i);
    out.push({ start, end: addDays(start, 6) });
  }
  return out;
}

type T = Pick<Task, "status" | "completed_at" | "created_at" | "due_date" | "deadline" | "deleted_at">;

const completedOn = (t: T, tz: string) => (t.status === "done" && t.completed_at ? dateIn(tz, t.completed_at) : null);

export function completedPerWeek(tasks: T[], weeks: WeekBucket[], tz: string) {
  return weeks.map((w) => ({
    week: w.start,
    count: tasks.filter((t) => {
      const d = completedOn(t, tz);
      return d !== null && d >= w.start && d <= w.end;
    }).length,
  }));
}

/** Share of tasks completed in the week that were done on or before their due date/deadline. */
export function onTimeRate(tasks: T[], weeks: WeekBucket[], tz: string) {
  return weeks.map((w) => {
    const done = tasks.filter((t) => {
      const d = completedOn(t, tz);
      return d !== null && d >= w.start && d <= w.end && (t.due_date || t.deadline);
    });
    const onTime = done.filter((t) => {
      const d = completedOn(t, tz)!;
      const limit = [t.due_date, t.deadline].filter(Boolean).sort().at(-1)!;
      return d <= limit;
    });
    return { week: w.start, rate: done.length ? Math.round((onTime.length / done.length) * 100) : null, total: done.length };
  });
}

/** Tasks that were open and past due at the end of each week. */
export function overdueTrend(tasks: T[], weeks: WeekBucket[], tz: string) {
  return weeks.map((w) => {
    const day = w.end;
    const count = tasks.filter((t) => {
      if (t.deleted_at || t.status === "cancelled" || !t.due_date) return false;
      const created = dateIn(tz, t.created_at);
      const done = completedOn(t, tz);
      const openThen = created <= day && (done === null || done > day);
      return openThen && t.due_date < day;
    }).length;
    return { week: w.start, count };
  });
}

export function createdVsCompleted(tasks: T[], weeks: WeekBucket[], tz: string) {
  return weeks.map((w) => ({
    week: w.start,
    created: tasks.filter((t) => {
      const d = dateIn(tz, t.created_at);
      return d >= w.start && d <= w.end;
    }).length,
    completed: tasks.filter((t) => {
      const d = completedOn(t, tz);
      return d !== null && d >= w.start && d <= w.end;
    }).length,
  }));
}

/** Percent done at the end of each week (tasks that existed by then). */
export function progressOverTime(tasks: T[], weeks: WeekBucket[], tz: string) {
  return weeks.map((w) => {
    const existing = tasks.filter((t) => t.status !== "cancelled" && !t.deleted_at && dateIn(tz, t.created_at) <= w.end);
    const done = existing.filter((t) => {
      const d = completedOn(t, tz);
      return d !== null && d <= w.end;
    });
    return { week: w.start, percent: existing.length ? Math.round((done.length / existing.length) * 100) : 0, done: done.length, total: existing.length };
  });
}

export function minutesByKey(entries: Pick<TimeEntry, "task_id" | "minutes" | "started_at">[], keyOf: (taskId: string) => string | null, from: ISODate, tz: string) {
  const out = new Map<string, number>();
  for (const e of entries) {
    if (dateIn(tz, e.started_at) < from) continue;
    const k = keyOf(e.task_id);
    if (!k) continue;
    out.set(k, (out.get(k) ?? 0) + e.minutes);
  }
  return [...out.entries()].sort((a, b) => b[1] - a[1]);
}
