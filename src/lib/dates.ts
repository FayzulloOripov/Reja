// Date helpers. Calendar days are ISO strings ("2026-10-05") and are manipulated with pure
// UTC arithmetic, so the result never depends on the machine's time zone. Instants (Date / ISO
// timestamps) are converted to and from a user's zone with date-fns-tz.

import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import type { ISODate } from "./types";

const DAY_MS = 86_400_000;

export function parseISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISODate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: ISODate, n: number): ISODate {
  return toISODate(new Date(parseISODate(iso).getTime() + n * DAY_MS));
}

export function addMonths(iso: ISODate, n: number): ISODate {
  const d = parseISODate(iso);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return toISODate(target);
}

/** b − a in whole days. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / DAY_MS);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(iso: ISODate): number {
  const d = parseISODate(iso).getUTCDay();
  return d === 0 ? 7 : d;
}

export function startOfWeek(iso: ISODate): ISODate {
  return addDays(iso, 1 - isoWeekday(iso));
}

export function startOfMonth(iso: ISODate): ISODate {
  return `${iso.slice(0, 7)}-01`;
}

export function daysInMonth(iso: ISODate): number {
  const d = parseISODate(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Next date on or after `from` whose ISO weekday is `dow`. */
export function nextWeekday(from: ISODate, dow: number, includeToday = true): ISODate {
  let diff = (dow - isoWeekday(from) + 7) % 7;
  if (diff === 0 && !includeToday) diff = 7;
  return addDays(from, diff);
}

/** "Today" in a time zone. */
export function todayIn(tz: string, now: Date = new Date()): ISODate {
  return formatInTimeZone(now, tz, "yyyy-MM-dd");
}

/** Local wall-clock time "HH:mm" of an instant in a time zone. */
export function timeIn(tz: string, at: Date | string): string {
  return formatInTimeZone(typeof at === "string" ? new Date(at) : at, tz, "HH:mm");
}

/** Local calendar date of an instant in a time zone. */
export function dateIn(tz: string, at: Date | string): ISODate {
  return formatInTimeZone(typeof at === "string" ? new Date(at) : at, tz, "yyyy-MM-dd");
}

/** The UTC instant for a local date + "HH:mm" in a time zone. */
export function zonedToUtc(date: ISODate, time: string, tz: string): Date {
  const hhmm = time.length === 5 ? `${time}:00` : time.slice(0, 8);
  return fromZonedTime(`${date}T${hhmm}`, tz);
}

/** Minutes since local midnight for an instant. */
export function minutesOfDay(tz: string, at: Date | string): number {
  const z = toZonedTime(typeof at === "string" ? new Date(at) : at, tz);
  return z.getHours() * 60 + z.getMinutes();
}

export function hhmmToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function minutesToHHMM(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Coming Saturday (today if today is Saturday). Used by the planner import's "hafta" bucket. */
export function comingSaturday(today: ISODate): ISODate {
  return nextWeekday(today, 6, true);
}

export type PartOfDay = "morning" | "afternoon" | "evening" | "night";

/** Part of the day for a local hour (0–23): tong 05–11, kun 11–17, kech 17–22, tun 22–05. */
export function partOfDay(hour: number): PartOfDay {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

export function partOfDayIn(tz: string, at: Date = new Date()): PartOfDay {
  return partOfDay(Number(formatInTimeZone(at, tz, "H")));
}
