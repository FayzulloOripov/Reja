// Goal progress, explained. A key result's progress is how far its current value has moved from the
// start value towards the target; a goal's progress is the average of its key results. The pace
// compares that with how much of the goal's time has passed.

import { dateIn, diffDays } from "./dates";
import { counted, toUzs } from "./money";
import type { Deal, DealStage, Goal, ISODate, KeyResult, MoneyEntry, Task, TaskLabel } from "./types";

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

// ------------------------------------------------------------------ key results fed by data

export interface AutoData {
  money: Pick<MoneyEntry, "kind" | "amount" | "currency" | "rate" | "amount_uzs" | "date" | "status" | "partner_id" | "direct" | "deleted_at" | "project_id" | "workspace_id">[];
  deals: Pick<Deal, "stage_id" | "closed_at" | "deleted_at" | "workspace_id" | "project_id">[];
  stages: Record<string, Pick<DealStage, "kind">>;
  tasks: Pick<Task, "id" | "status" | "completed_at" | "deleted_at" | "workspace_id">[];
  taskLabels: Pick<TaskLabel, "task_id" | "label_id">[];
}

/** The goal's period as dates: start (or creation day) to target (or open-ended). */
export function goalPeriod(goal: Pick<Goal, "start_date" | "target_date" | "created_at">): { from: ISODate; to: ISODate } {
  return { from: goal.start_date ?? goal.created_at.slice(0, 10), to: goal.target_date ?? "9999-12-31" };
}

/**
 * The live value of a data-fed key result, or null for a manual one.
 *   money_income — approved income this month (UZS ÷ scale), optionally for one project;
 *   pipeline_won — deals won within the goal's period;
 *   tasks_done   — tasks with the chosen label completed within the goal's period.
 */
export function autoValue(
  kr: Pick<KeyResult, "source" | "source_config" | "workspace_id">,
  goal: Pick<Goal, "start_date" | "target_date" | "created_at">,
  data: AutoData,
  today: ISODate,
  tz: string,
): number | null {
  const cfg = kr.source_config ?? {};
  const { from, to } = goalPeriod(goal);
  const within = (iso: string | null) => !!iso && dateIn(tz, iso) >= from && dateIn(tz, iso) <= to;
  switch (kr.source) {
    case "money_income": {
      const month = today.slice(0, 7);
      const list = counted(data.money.filter((e) => e.workspace_id === kr.workspace_id && e.kind === "income" && e.date.slice(0, 7) === month && (!cfg.project_id || e.project_id === cfg.project_id)));
      const uzs = list.reduce((n, e) => n + toUzs(e), 0);
      return Math.round((uzs / (cfg.scale || 1)) * 100) / 100;
    }
    case "pipeline_won":
      return data.deals.filter((d) => !d.deleted_at && d.workspace_id === kr.workspace_id && data.stages[d.stage_id]?.kind === "won" && within(d.closed_at)).length;
    case "tasks_done": {
      if (!cfg.label_id) return 0;
      const labelled = new Set(data.taskLabels.filter((l) => l.label_id === cfg.label_id).map((l) => l.task_id));
      return data.tasks.filter((t) => !t.deleted_at && t.status === "done" && labelled.has(t.id) && within(t.completed_at)).length;
    }
    default:
      return null;
  }
}

/** A key result with its live value applied (manual ones unchanged). */
export function withLive<K extends KeyResult>(kr: K, goal: Goal, data: AutoData, today: ISODate, tz: string): K {
  const v = autoValue(kr, goal, data, today, tz);
  return v === null ? kr : { ...kr, current: v };
}
