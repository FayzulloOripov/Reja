// Organisation helpers: waiting-for, meetings, weekly review, daily shutdown and routines.
// Pure functions, so the rules are unit-tested without the store.

import { RRule } from "rrule";
import { addDays, dateIn, diffDays, nextWeekday, startOfWeek, timeIn, zonedToUtc } from "./dates";
import { isOpen } from "./health";
import type { ISODate, MeetingItem, Routine, RoutineRun, Task, TimeEntry } from "./types";

// ------------------------------------------------------------------ waiting-for

export type WaitingOn = { kind: "user"; id: string } | { kind: "contact"; id: string };

export function waitingOn(task: Pick<Task, "waiting_on_user_id" | "waiting_on_contact_id">): WaitingOn | null {
  if (task.waiting_on_contact_id) return { kind: "contact", id: task.waiting_on_contact_id };
  if (task.waiting_on_user_id) return { kind: "user", id: task.waiting_on_user_id };
  return null;
}

/** Days since waiting started (0 = today). */
export function waitingDays(task: Pick<Task, "waiting_since">, today: ISODate): number | null {
  return task.waiting_since ? Math.max(0, diffDays(task.waiting_since, today)) : null;
}

/** Default follow-up: three days from now, skipping to Monday when that falls on a Sunday. */
export function defaultFollowUp(today: ISODate): ISODate {
  const d = addDays(today, 3);
  return new Date(d + "T00:00:00Z").getUTCDay() === 0 ? addDays(d, 1) : d;
}

export function followUpDue(task: Pick<Task, "follow_up_date" | "status" | "completed_at">, today: ISODate): boolean {
  return isOpen(task as Task) && !!task.follow_up_date && task.follow_up_date <= today;
}

/** The open tasks I'm waiting on someone for (set through the panel), oldest first. */
export function waitingTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => isOpen(t) && !t.deleted_at && (t.waiting_on_user_id || t.waiting_on_contact_id))
    .sort((a, b) => (a.waiting_since ?? "").localeCompare(b.waiting_since ?? "") || a.title.localeCompare(b.title));
}

// ------------------------------------------------------------------ meetings

/** The weekly partner meeting: Friday 19:30, every week. */
export const PARTNER_TEMPLATE = { key: "partner_weekly", time: "19:30", dow: 5, recurrence: "FREQ=WEEKLY;BYDAY=FR", duration: 60 } as const;

/** Next Friday 19:30 (today if it is Friday and the time hasn't passed). */
export function partnerMeetingStart(tz: string, now: Date = new Date()): string {
  const today = dateIn(tz, now);
  let date = nextWeekday(today, PARTNER_TEMPLATE.dow, true);
  if (date === today && timeIn(tz, now) >= PARTNER_TEMPLATE.time) date = addDays(date, 7);
  return zonedToUtc(date, PARTNER_TEMPLATE.time, tz).toISOString();
}

/** The start of the next meeting in a recurring series, at the same local time. */
export function nextMeetingStart(rule: string, startsAt: string, tz: string): string | null {
  try {
    const date = dateIn(tz, startsAt);
    const time = timeIn(tz, startsAt);
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    const opts = RRule.parseString(rule.replace(/^RRULE:/, ""));
    const next = new RRule({ ...opts, dtstart: new Date(Date.UTC(y, m - 1, d, hh, mm)) }).after(new Date(Date.UTC(y, m - 1, d, hh, mm)), false);
    if (!next) return null;
    return zonedToUtc(next.toISOString().slice(0, 10), time, tz).toISOString();
  } catch {
    return null;
  }
}

/** Agenda points still open when a meeting finishes move to the next one. */
export function carryOver(items: Pick<MeetingItem, "kind" | "text" | "done" | "position">[]): string[] {
  return items
    .filter((i) => i.kind === "agenda" && !i.done)
    .sort((a, b) => a.position - b.position)
    .map((i) => i.text);
}

export interface WeekNumbers {
  done: number;
  overdue: number;
  minutes: number;
}

/** A week's numbers: tasks completed in it, tasks overdue now, and minutes tracked (by one person when userId is given). */
export function weekNumbers(
  tasks: Task[],
  entries: Pick<TimeEntry, "minutes" | "started_at" | "user_id">[],
  weekStart: ISODate,
  today: ISODate,
  tz: string,
  userId?: string,
): WeekNumbers {
  const end = addDays(weekStart, 6);
  const inWeek = (iso: string | null) => !!iso && dateIn(tz, iso) >= weekStart && dateIn(tz, iso) <= end;
  const live = tasks.filter((t) => !t.deleted_at);
  return {
    done: live.filter((t) => t.status === "done" && inWeek(t.completed_at)).length,
    overdue: live.filter((t) => isOpen(t) && !!t.due_date && t.due_date < today).length,
    minutes: entries.filter((e) => inWeek(e.started_at) && (!userId || e.user_id === userId)).reduce((s, e) => s + e.minutes, 0),
  };
}

export function lastWeekStart(today: ISODate): ISODate {
  return addDays(startOfWeek(today), -7);
}

// ------------------------------------------------------------------ routines

/** Whether a routine runs on a date (its RRULE, counted from the day it was created). */
export function routineDueOn(routine: Pick<Routine, "recurrence" | "created_at">, date: ISODate, tz: string): boolean {
  try {
    const start = dateIn(tz, routine.created_at);
    if (date < start) return false;
    const [y, m, d] = start.split("-").map(Number);
    const opts = RRule.parseString(routine.recurrence.replace(/^RRULE:/, ""));
    const rule = new RRule({ ...opts, dtstart: new Date(Date.UTC(y, m - 1, d)) });
    const [yy, mm, dd] = date.split("-").map(Number);
    const day = new Date(Date.UTC(yy, mm - 1, dd));
    return rule.between(day, new Date(day.getTime() + 86_399_000), true).length > 0;
  } catch {
    return false;
  }
}

export function runProgress(routine: Pick<Routine, "items">, run: Pick<RoutineRun, "checked"> | undefined): { done: number; total: number } {
  const ids = new Set(routine.items.map((i) => i.id));
  return { done: (run?.checked ?? []).filter((id) => ids.has(id)).length, total: routine.items.length };
}

/** Toggle one item; returns the new checked list and whether the run is now complete. */
export function toggleRunItem(routine: Pick<Routine, "items">, checked: string[], itemId: string): { checked: string[]; complete: boolean } {
  const next = checked.includes(itemId) ? checked.filter((x) => x !== itemId) : [...checked, itemId];
  const ids = routine.items.map((i) => i.id);
  return { checked: next, complete: ids.length > 0 && ids.every((id) => next.includes(id)) };
}

export const ROUTINE_RULES = {
  daily: "FREQ=DAILY",
  weekdays: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  weekly: "FREQ=WEEKLY",
  monthly: "FREQ=MONTHLY",
} as const;

// ------------------------------------------------------------------ daily shutdown

/** Open tasks planned for today (due or top-3) that are still undone at the end of the day. */
export function unfinishedToday(tasks: Task[], today: ISODate): Task[] {
  return tasks.filter((t) => isOpen(t) && !t.deleted_at && ((t.due_date && t.due_date <= today) || t.top_date === today));
}

export function shutdownDue(
  profile: { shutdown_enabled: boolean; shutdown_time: string },
  nowHHMM: string,
  doneToday: boolean,
): boolean {
  return profile.shutdown_enabled && !doneToday && nowHHMM >= profile.shutdown_time.slice(0, 5);
}
