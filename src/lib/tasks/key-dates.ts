// One rule for "the next date" of a task, used by every screen: the planned day (due date) and the
// hard deadline both count; the earliest one that is today or later wins. Overdue dates are shown
// separately (as overdue), so they never count as "next".

import type { ISODate, Task } from "../types";

export type KeyDateKind = "due" | "deadline";

export interface KeyDate {
  date: ISODate;
  kind: KeyDateKind;
}

export function keyDates(task: Pick<Task, "due_date" | "deadline">): KeyDate[] {
  const out: KeyDate[] = [];
  if (task.due_date) out.push({ date: task.due_date, kind: "due" });
  if (task.deadline) out.push({ date: task.deadline, kind: "deadline" });
  return out;
}

/** Earliest due date or deadline on or after `today`. */
export function nextKeyDate(task: Pick<Task, "due_date" | "deadline">, today: ISODate): KeyDate | null {
  const upcoming = keyDates(task)
    .filter((k) => k.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "deadline" ? -1 : 1));
  return upcoming[0] ?? null;
}

/** The next key date across many tasks (e.g. a project's "next date"). */
export function nextKeyDateOf<T extends Pick<Task, "due_date" | "deadline">>(tasks: T[], today: ISODate): (KeyDate & { task: T }) | null {
  let best: (KeyDate & { task: T }) | null = null;
  for (const task of tasks) {
    const k = nextKeyDate(task, today);
    if (k && (!best || k.date < best.date || (k.date === best.date && k.kind === "deadline"))) best = { ...k, task };
  }
  return best;
}
