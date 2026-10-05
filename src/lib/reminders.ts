// Reminder timing, shared by the UI and the scheduler. Mirrors public.task_due_moment and
// public.reminder_offset_interval in the database.

import { addDays, dateIn, hhmmToMinutes, isoWeekday, minutesOfDay, todayIn, zonedToUtc } from "./dates";
import type { ISODate, ReminderOffset } from "./types";

export const ALL_DAY_REMINDER_TIME = "09:00";

const OFFSET_MINUTES: Record<Exclude<ReminderOffset, "custom">, number> = {
  at_due: 0,
  "15m": 15,
  "1h": 60,
  "1d": 1440,
};

/** The moment a task is due for a user: its exact time, or 09:00 local on the due date. */
export function dueMoment(dueDate: ISODate | null, dueAt: string | null, tz: string): Date | null {
  if (dueAt) return new Date(dueAt);
  if (!dueDate) return null;
  return zonedToUtc(dueDate, ALL_DAY_REMINDER_TIME, tz);
}

export function computeRemindAt(
  dueDate: ISODate | null,
  dueAt: string | null,
  tz: string,
  offset: Exclude<ReminderOffset, "custom">,
): Date | null {
  if (dueAt) return new Date(new Date(dueAt).getTime() - OFFSET_MINUTES[offset] * 60_000);
  if (!dueDate) return null;
  // all-day tasks: 09:00 on the day; "1 day before" is 09:00 the day before (mirrors public.reminder_moment)
  return zonedToUtc(offset === "1d" ? addDays(dueDate, -1) : dueDate, ALL_DAY_REMINDER_TIME, tz);
}

export interface QuietHours {
  enabled: boolean;
  start: string; // HH:MM[:SS]
  end: string;
}

/** Is `now` inside the quiet window? Handles windows that cross midnight (22:00 → 07:00). */
export function inQuietHours(now: Date, tz: string, q: QuietHours): boolean {
  if (!q.enabled) return false;
  const start = hhmmToMinutes(q.start);
  const end = hhmmToMinutes(q.end);
  if (start === end) return false;
  const m = minutesOfDay(tz, now);
  return start < end ? m >= start && m < end : m >= start || m < end;
}

/** When the current quiet window ends (UTC). Only meaningful when inQuietHours() is true. */
export function quietHoursEnd(now: Date, tz: string, q: QuietHours): Date {
  const end = hhmmToMinutes(q.end);
  const m = minutesOfDay(tz, now);
  const today = dateIn(tz, now);
  const endDate = m < end ? today : addDays(today, 1);
  return zonedToUtc(endDate, q.end.slice(0, 5), tz);
}

/** Deliver now, or the time quiet hours end. */
export function deliveryTime(now: Date, tz: string, q: QuietHours): Date {
  return inQuietHours(now, tz, q) ? quietHoursEnd(now, tz, q) : now;
}

export interface DailySlotProfile {
  timezone: string;
  digest_enabled: boolean;
  digest_time: string;
  review_enabled: boolean;
  review_dow: number;
  review_time: string;
  overdue_nudge_enabled: boolean;
  last_digest_on: ISODate | null;
  last_review_on: ISODate | null;
  last_overdue_nudge_on: ISODate | null;
}

/** How late a missed slot may still be sent (e.g. the cron was down for a while). */
const LATE_WINDOW_MINUTES = 180;
/** The overdue nudge goes out with the digest if enabled, otherwise at this local time. */
const OVERDUE_NUDGE_TIME = "10:00";

/**
 * Which daily messages are due for this user right now. The scheduler then claims each slot
 * atomically (claim_daily_slot) so a slot is sent at most once per local date.
 */
export function dueDailySlots(p: DailySlotProfile, now: Date): { kind: "digest" | "review" | "overdue"; date: ISODate }[] {
  const tz = p.timezone || "Asia/Tashkent";
  const today = todayIn(tz, now);
  const minute = minutesOfDay(tz, now);
  const out: { kind: "digest" | "review" | "overdue"; date: ISODate }[] = [];
  const inWindow = (time: string) => {
    const t = hhmmToMinutes(time);
    return minute >= t && minute < t + LATE_WINDOW_MINUTES;
  };

  if (p.digest_enabled && inWindow(p.digest_time) && (!p.last_digest_on || p.last_digest_on < today)) {
    out.push({ kind: "digest", date: today });
  }
  if (p.review_enabled && isoWeekday(today) === p.review_dow && inWindow(p.review_time) && (!p.last_review_on || p.last_review_on < today)) {
    out.push({ kind: "review", date: today });
  }
  const nudgeTime = p.digest_enabled ? p.digest_time : OVERDUE_NUDGE_TIME;
  if (p.overdue_nudge_enabled && inWindow(nudgeTime) && (!p.last_overdue_nudge_on || p.last_overdue_nudge_on < today)) {
    out.push({ kind: "overdue", date: today });
  }
  return out;
}

export const REMINDER_OFFSETS = ["at_due", "15m", "1h", "1d"] as const;
