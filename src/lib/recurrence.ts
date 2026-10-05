// Recurring tasks. Rules are RRULE strings evaluated in the user's time zone using "floating"
// dates: the local wall-clock time is encoded as a UTC Date, rrule steps through it, and the
// result is converted back. A 09:00 task therefore stays at 09:00 local time across daylight
// saving changes.

import { RRule } from "rrule";
import { dateIn, timeIn, todayIn, zonedToUtc } from "./dates";
import type { ISODate } from "./types";

export interface Occurrence {
  dueDate: ISODate;
  /** UTC instant when the task has a time, otherwise null */
  dueAt: string | null;
}

function floating(date: ISODate, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm));
}

export function isValidRRule(rule: string): boolean {
  try {
    RRule.parseString(rule.replace(/^RRULE:/, ""));
    return /FREQ=/.test(rule);
  } catch {
    return false;
  }
}

/**
 * The next occurrence after the current one. It is always later than both the current due date
 * and today, so completing an overdue recurring task schedules the next one in the future.
 */
export function nextOccurrence(
  rule: string,
  current: { dueDate: ISODate | null; dueAt: string | null },
  tz: string,
  now: Date = new Date(),
): Occurrence | null {
  if (!isValidRRule(rule)) return null;
  const today = todayIn(tz, now);
  const startDate = current.dueAt ? dateIn(tz, current.dueAt) : (current.dueDate ?? today);
  const time = current.dueAt ? timeIn(tz, current.dueAt) : "00:00";
  const dtstart = floating(startDate, time);

  const options = RRule.parseString(rule.replace(/^RRULE:/, ""));
  const rrule = new RRule({ ...options, dtstart });

  const endOfToday = floating(today, "23:59");
  const pivot = dtstart > endOfToday ? dtstart : endOfToday;
  const next = rrule.after(pivot, false);
  if (!next) return null;

  const dueDate = next.toISOString().slice(0, 10);
  const dueAt = current.dueAt ? zonedToUtc(dueDate, time, tz).toISOString() : null;
  return { dueDate, dueAt };
}

/** Upcoming occurrences, for previews ("Next: Fri 9 Oct"). */
export function upcomingOccurrences(rule: string, from: ISODate, count: number): ISODate[] {
  if (!isValidRRule(rule)) return [];
  const options = RRule.parseString(rule.replace(/^RRULE:/, ""));
  const rrule = new RRule({ ...options, dtstart: floating(from, "00:00"), count });
  return rrule.all().map((d) => d.toISOString().slice(0, 10));
}

export const PRESET_RULES = {
  daily: "FREQ=DAILY",
  weekdays: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA",
  weekly: "FREQ=WEEKLY",
  monthly: "FREQ=MONTHLY",
  yearly: "FREQ=YEARLY",
} as const;
