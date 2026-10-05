import { describe, expect, it } from "vitest";
import { planCompletion } from "@/lib/tasks/complete";
import type { ChecklistItem, Reminder, Task } from "@/lib/types";

let n = 0;
const newId = () => `id-${++n}`;

const base: Task = {
  id: "t1", workspace_id: "w", project_id: "p", section_id: null, parent_id: null, title: "Weekly report",
  description: null, status: "todo", priority: "high", start_date: "2026-10-07", due_date: "2026-10-09",
  due_at: "2026-10-09T05:00:00.000Z", deadline: null, estimate_min: 30, recurrence: "FREQ=WEEKLY;BYDAY=FR",
  top_date: "2026-10-09", position: 1, completed_at: null, created_by: "u", source: null,
  created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", deleted_at: null,
};

describe("planCompletion", () => {
  it("only completes non-recurring tasks", () => {
    const plan = planCompletion({ task: { ...base, recurrence: null }, subtasks: [], checklist: [], labels: [], assignees: [], reminders: [], tz: "Asia/Tashkent", now: new Date("2026-10-09T06:00:00Z"), newId });
    expect(plan.complete.values.status).toBe("done");
    expect(plan.next).toBeNull();
  });

  it("creates the next occurrence with copied children and shifted reminders", () => {
    const checklist: ChecklistItem[] = [{ id: "c1", task_id: "t1", workspace_id: "w", text: "Numbers", done: true, position: 1, created_at: "", updated_at: "" }];
    const reminders: Reminder[] = [
      { id: "r1", user_id: "u", workspace_id: "w", task_id: "t1", title: null, remind_at: "2026-10-09T04:00:00.000Z", offset_rule: "1h", is_auto: false, channels: ["telegram"], status: "sent", attempts: 1, claimed_at: null, sent_at: "x", last_error: null, created_at: "", updated_at: "" },
      { id: "r2", user_id: "u", workspace_id: "w", task_id: "t1", title: null, remind_at: "2026-10-08T15:00:00.000Z", offset_rule: "custom", is_auto: false, channels: ["push"], status: "sent", attempts: 1, claimed_at: null, sent_at: "x", last_error: null, created_at: "", updated_at: "" },
      { id: "r3", user_id: "u", workspace_id: "w", task_id: "t1", title: null, remind_at: "2026-10-09T05:00:00.000Z", offset_rule: "at_due", is_auto: true, channels: ["push"], status: "sent", attempts: 1, claimed_at: null, sent_at: "x", last_error: null, created_at: "", updated_at: "" },
    ];
    const subtask: Task = { ...base, id: "s1", parent_id: "t1", recurrence: null, due_date: "2026-10-08", due_at: null, status: "done" };
    const plan = planCompletion({
      task: base, subtasks: [subtask], checklist, labels: [{ task_id: "t1", label_id: "l1", workspace_id: "w", created_at: "" }],
      assignees: [{ task_id: "t1", user_id: "u2", workspace_id: "w", created_at: "" }], reminders,
      tz: "Asia/Tashkent", now: new Date("2026-10-09T06:00:00Z"), newId,
    });
    const next = plan.next!;
    expect(next.task.due_date).toBe("2026-10-16");
    expect(next.task.due_at).toBe("2026-10-16T05:00:00.000Z");
    expect(next.task.start_date).toBe("2026-10-14");
    expect(next.task.status).toBe("todo");
    expect(next.task.top_date).toBeNull();
    expect(next.subtasks[0]).toMatchObject({ parent_id: next.task.id, status: "todo", due_date: "2026-10-15" });
    expect(next.checklist[0]).toMatchObject({ task_id: next.task.id, done: false, text: "Numbers" });
    expect(next.labels[0].task_id).toBe(next.task.id);
    expect(next.assignees[0]).toMatchObject({ task_id: next.task.id, user_id: "u2" });
    // automatic reminders are left to the database; offset and custom ones move with the task
    expect(next.reminders.map((r) => [r.offset_rule, r.remind_at, r.status])).toEqual([
      ["1h", "2026-10-16T04:00:00.000Z", "pending"],
      ["custom", "2026-10-15T15:00:00.000Z", "pending"],
    ]);
  });
});
