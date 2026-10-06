import { describe, expect, it } from "vitest";
import { isDelegatedBy, responsibleIds } from "@/lib/tasks/responsible";
import type { Task } from "@/lib/types";
import { workloadGrid } from "@/lib/workload";

const base = { workspace_id: "w", project_id: "p", section_id: null, parent_id: null, description: null, status: "todo", priority: "none", start_date: null, due_at: null, deadline: null, estimate_min: null, recurrence: null, recurrence_parent_id: null, top_date: null, position: 0, completed_at: null, source: null, created_at: "", updated_at: "", deleted_at: null } as const;
const task = (id: string, due: string, created_by: string, extra: Partial<Task> = {}): Task => ({ ...base, id, title: id, due_date: due, created_by, ...extra }) as Task;

describe("responsible", () => {
  it("is the assignees, or the creator when nobody is assigned", () => {
    expect(responsibleIds({ id: "a", created_by: "me" }, { a: [{ user_id: "you" }] })).toEqual(["you"]);
    expect(responsibleIds({ id: "a", created_by: "me" }, {})).toEqual(["me"]);
  });
  it("delegated = created or followed by me, owned by someone else", () => {
    expect(isDelegatedBy({ id: "a", created_by: "me" }, "me", { a: [{ user_id: "you" }] }, false)).toBe(true);
    expect(isDelegatedBy({ id: "a", created_by: "you" }, "me", { a: [{ user_id: "you" }] }, true)).toBe(true);
    expect(isDelegatedBy({ id: "a", created_by: "you" }, "me", { a: [{ user_id: "you" }] }, false)).toBe(false);
    expect(isDelegatedBy({ id: "a", created_by: "me" }, "me", { a: [{ user_id: "me" }, { user_id: "you" }] }, false)).toBe(false);
  });
});

describe("workloadGrid", () => {
  const me = { id: "me", work_days: [1, 2, 3, 4, 5, 6], daily_capacity_tasks: 2, daily_capacity_minutes: null };
  const days = ["2026-10-10", "2026-10-11"].map((d) => ({ key: d, from: d, to: d })); // Saturday, Sunday

  it("counts the creator's unassigned tasks and respects work days and capacity", () => {
    const tasks = [task("a", "2026-10-10", "me"), task("b", "2026-10-10", "me"), task("c", "2026-10-10", "me"), task("d", "2026-10-11", "me")];
    const [row] = workloadGrid({ tasks, assignees: {}, people: [me], columns: days });
    expect(row.total).toBe(4);
    expect(row.cells[0]).toMatchObject({ dayOff: false, capacityTasks: 2, over: true });
    // Sunday is not a work day: any task there is over capacity
    expect(row.cells[1]).toMatchObject({ dayOff: true, capacityTasks: 0, over: true });
  });

  it("measures hours when the person set an hours capacity", () => {
    const person = { ...me, daily_capacity_tasks: 10, daily_capacity_minutes: 120 };
    const tasks = [task("a", "2026-10-10", "me", { estimate_min: 90 }), task("b", "2026-10-10", "me", { estimate_min: 60 })];
    const [row] = workloadGrid({ tasks, assignees: {}, people: [person], columns: days });
    expect(row.cells[0]).toMatchObject({ minutes: 150, over: true });
  });

  it("scales the capacity of a week column by the work days in it", () => {
    const week = [{ key: "w", from: "2026-10-05", to: "2026-10-11" }];
    const [row] = workloadGrid({ tasks: [], assignees: {}, people: [me], columns: week });
    expect(row.cells[0].capacityTasks).toBe(12);
  });
});
