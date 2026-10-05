// Goal progress, explained. A key result's progress is how far its current value has moved from the
// start value towards the target; a goal's progress is the average of its key results. The pace
// compares that with how much of the goal's time has passed.

import { diffDays } from "./dates";
import type { Goal, ISODate, KeyResult } from "./types";

export function krProgress(k: Pick<KeyResult, "start_value" | "target" | "current">): number {
  const start = Number(k.start_value);
  const target = Number(k.target);
  const current = Number(k.current);
  if (target === start) return current >= target ? 100 : 0;
  return Math.max(0, Math.min(100, ((current - start) / (target - start)) * 100));
}

export function goalProgress(krs: Pick<KeyResult, "start_value" | "target" | "current">[]): number {
  return krs.length ? krs.reduce((n, k) => n + krProgress(k), 0) / krs.length : 0;
}

export type Pace = "ahead" | "on_pace" | "behind";

export interface GoalPace {
  /** share of the goal's period that has passed, 0–100 */
  elapsed: number;
  progress: number;
  pace: Pace;
}

/** The goal's period runs from its start date (or creation day) to its target date. */
export function goalPace(goal: Pick<Goal, "target_date" | "created_at"> & { start_date?: ISODate | null }, krs: Pick<KeyResult, "start_value" | "target" | "current">[], today: ISODate): GoalPace | null {
  if (!goal.target_date) return null;
  const start = goal.start_date ?? goal.created_at.slice(0, 10);
  const total = diffDays(start, goal.target_date);
  if (total <= 0) return null;
  const elapsed = Math.max(0, Math.min(100, (diffDays(start, today) / total) * 100));
  const progress = goalProgress(krs);
  const pace: Pace = progress >= elapsed + 5 ? "ahead" : progress < elapsed - 5 ? "behind" : "on_pace";
  return { elapsed, progress, pace };
}
