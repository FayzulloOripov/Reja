import { describe, expect, it } from "vitest";
import { activityFor, isMove } from "@/lib/activity";

let n = 0;
const ctx = { actorId: "me", now: "2026-10-05T10:00:00Z", newId: () => `a${++n}`, taskById: (id: string) => (id === "t1" ? { id: "t1", title: "Report", workspace_id: "w", project_id: "p" } : undefined) };
const task = { id: "t1", title: "Report", workspace_id: "w", project_id: "p", section_id: "s1", status: "todo", position: 1, deleted_at: null };

describe("activityFor (mirrors the database triggers)", () => {
  it("logs creation, completion, moves, assignment and comments", () => {
    expect(activityFor({ table: "tasks", kind: "insert", prev: null, next: task }, ctx)[0]).toMatchObject({ action: "created", task_id: "t1", diff: { title: "Report" } });
    expect(activityFor({ table: "tasks", kind: "update", prev: task, next: { ...task, status: "done" } }, ctx)[0]).toMatchObject({ action: "completed" });
    const moved = activityFor({ table: "tasks", kind: "update", prev: task, next: { ...task, section_id: "s2", position: 5 } }, ctx)[0];
    expect(isMove(moved)).toBe(true);
    expect(activityFor({ table: "task_assignees", kind: "insert", prev: null, next: { task_id: "t1", user_id: "you" } }, ctx)[0]).toMatchObject({ action: "assigned", diff: { user_id: "you" } });
    expect(activityFor({ table: "comments", kind: "insert", prev: null, next: { id: "c1", task_id: "t1", body_text: "Looks good" } }, ctx)[0]).toMatchObject({ action: "commented", entity_type: "comment", diff: { snippet: "Looks good" } });
  });

  it("ignores position-only changes", () => {
    expect(activityFor({ table: "tasks", kind: "update", prev: task, next: { ...task, position: 9 } }, ctx)).toEqual([]);
  });

  it("logs project creation and deletion", () => {
    const p = { id: "p", name: "Agency", workspace_id: "w", deleted_at: null, status: "active" };
    expect(activityFor({ table: "projects", kind: "insert", prev: null, next: p }, ctx)[0]).toMatchObject({ entity_type: "project", action: "created" });
    expect(activityFor({ table: "projects", kind: "update", prev: p, next: { ...p, deleted_at: "x" } }, ctx)[0]).toMatchObject({ action: "deleted" });
  });
});
