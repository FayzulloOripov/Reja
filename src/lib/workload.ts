// Workload grid: open tasks per person per day (or week), measured against each person's own
// work days and daily capacity (tasks and/or hours).

import { eachDay, isoWeekday } from "./dates";
import { isOpen } from "./health";
import { responsibleIds } from "./tasks/responsible";
import type { ISODate, Task, TaskAssignee } from "./types";

export const DEFAULT_CAPACITY_TASKS = 6;

export interface WorkloadPerson {
  id: string;
  work_days: number[];
  daily_capacity_tasks: number | null;
  daily_capacity_minutes: number | null;
}

export interface WorkloadColumn {
  key: string;
  from: ISODate;
  to: ISODate;
}

export interface WorkloadCell {
  key: string;
  tasks: Task[];
  minutes: number;
  /** work days of this person inside the column */
  workDays: number;
  capacityTasks: number;
  capacityMinutes: number | null;
  over: boolean;
  /** a single-day column that is not a work day for this person */
  dayOff: boolean;
}

export interface WorkloadRow {
  id: string;
  cells: WorkloadCell[];
  total: number;
}

export function workloadGrid(input: {
  tasks: Task[];
  assignees: Record<string, Pick<TaskAssignee, "user_id">[] | undefined>;
  people: WorkloadPerson[];
  columns: WorkloadColumn[];
}): WorkloadRow[] {
  const open = input.tasks.filter((x) => !x.deleted_at && !x.parent_id && isOpen(x) && x.due_date);
  const first = input.columns[0];
  return input.people.map((p) => {
    const mine = open.filter((x) => responsibleIds(x, input.assignees).includes(p.id));
    const cells = input.columns.map((c) => {
      // overdue work lands in the first column
      const list = mine.filter((x) => (x.due_date! >= c.from && x.due_date! <= c.to) || (c === first && x.due_date! < c.from));
      const days = eachDay(c.from, c.to);
      const workDays = days.filter((d) => p.work_days.includes(isoWeekday(d))).length;
      const capacityTasks = (p.daily_capacity_tasks ?? DEFAULT_CAPACITY_TASKS) * workDays;
      const capacityMinutes = p.daily_capacity_minutes ? p.daily_capacity_minutes * workDays : null;
      const minutes = list.reduce((n, x) => n + (x.estimate_min ?? 0), 0);
      const over = list.length > 0 && (list.length > capacityTasks || (capacityMinutes !== null && minutes > capacityMinutes));
      return { key: c.key, tasks: list, minutes, workDays, capacityTasks, capacityMinutes, over, dayOff: days.length === 1 && workDays === 0 };
    });
    return { id: p.id, cells, total: cells.reduce((n, c) => n + c.tasks.length, 0) };
  });
}
