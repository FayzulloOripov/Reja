import { addDays, isoWeekday } from "./dates";
import type { Habit, ISODate } from "./types";

export function scheduledOn(habit: Pick<Habit, "days">, date: ISODate): boolean {
  return habit.days.includes(isoWeekday(date));
}

/**
 * Consecutive scheduled days completed, counting back from today. Unscheduled days don't break
 * a streak, and today only counts once it is checked (an unchecked today doesn't break it either).
 */
export function currentStreak(habit: Pick<Habit, "days">, done: Set<ISODate>, today: ISODate, limit = 400): number {
  let streak = 0;
  let d = today;
  if (!done.has(today)) d = addDays(today, -1);
  for (let i = 0; i < limit; i++, d = addDays(d, -1)) {
    if (!scheduledOn(habit, d)) continue;
    if (done.has(d)) streak++;
    else break;
  }
  return streak;
}

export function bestStreak(habit: Pick<Habit, "days">, done: Set<ISODate>, from: ISODate, to: ISODate): number {
  let best = 0;
  let run = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!scheduledOn(habit, d)) continue;
    if (done.has(d)) {
      run++;
      best = Math.max(best, run);
    } else if (d < to) {
      run = 0;
    }
  }
  return best;
}
