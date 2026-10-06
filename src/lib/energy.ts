// Energy labels: «chuqur ish» (deep work) belongs in the morning focus block, «tez ish» (quick
// tasks) fill the gaps between meetings and blocks. Pure, unit-tested.

import { byDueThenPriority } from "./filters";
import { isOpen } from "./health";
import type { ISODate, Task } from "./types";

export interface Span {
  start: number; // minutes of the day
  end: number;
}

/** Morning ends at noon: until then, deep work is suggested. */
export const MORNING_END = 12 * 60;
/** A task without an estimate is assumed to take this long. */
export const QUICK_DEFAULT_MIN = 15;

/** Free spans of at least `min` minutes between busy spans, within [from, to]. */
export function freeGaps(busy: Span[], from: number, to: number, min = 15): Span[] {
  const sorted = busy.filter((b) => b.end > from && b.start < to).sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  let cursor = from;
  for (const b of sorted) {
    if (b.start - cursor >= min) out.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (to - cursor >= min) out.push({ start: cursor, end: to });
  return out;
}

export interface EnergySuggestion {
  /** deep tasks to start the morning with (empty after noon) */
  deep: Task[];
  /** the next free gap from now, and quick tasks that fit into it */
  gap: Span | null;
  quick: Task[];
}

/**
 * What to work on now. Candidates are open tasks due within the next week (or undated) with an
 * energy label; deep tasks come first in the morning, quick tasks fill the next free gap.
 */
export function energySuggestions(
  tasks: Task[],
  opts: { today: ISODate; nowMin: number; dayEnd: number; busy: Span[]; horizon: ISODate; limit?: number },
): EnergySuggestion {
  const limit = opts.limit ?? 3;
  const candidates = tasks
    .filter((t) => isOpen(t) && !t.deleted_at && t.status !== "waiting" && (!t.due_date || t.due_date <= opts.horizon))
    .sort(byDueThenPriority);
  const deep = opts.nowMin < MORNING_END ? candidates.filter((t) => t.energy === "deep").slice(0, limit) : [];
  const gap = freeGaps(opts.busy, opts.nowMin, opts.dayEnd)[0] ?? null;
  const room = gap ? gap.end - gap.start : 0;
  const quick = gap ? candidates.filter((t) => t.energy === "quick" && (t.estimate_min ?? QUICK_DEFAULT_MIN) <= room).slice(0, limit) : [];
  return { deep, gap, quick };
}
