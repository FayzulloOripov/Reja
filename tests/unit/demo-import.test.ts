import { describe, expect, it } from "vitest";
import { buildDemoData, DEMO_USER_ID } from "@/lib/demo/seed";
import { isSeedId, planDemoImport, type Snapshot } from "@/lib/demo/import";

function snapshot(): Snapshot {
  const data = buildDemoData(DEMO_USER_ID, "2026-10-05", "Asia/Tashkent", "uz") as unknown as Record<string, Record<string, unknown>[]>;
  const out: Snapshot = {};
  for (const [table, rows] of Object.entries(data)) {
    out[table] = Object.fromEntries(rows.map((r, i) => [String(r.id ?? `${table}-${i}`), r]));
  }
  return out;
}

let n = 0;
const newId = () => `new-${++n}`;
const ME = "11111111-1111-4111-8111-111111111111";
const WS = "22222222-2222-4222-8222-222222222222";

describe("planDemoImport", () => {
  it("brings nothing in 'mine' mode when the visitor typed nothing", () => {
    const { items } = planDemoImport(snapshot(), { userId: ME, workspaceId: WS, mode: "mine", newId });
    expect(items).toEqual([]);
  });

  it("brings a typed task together with the demo project and section it lives in", () => {
    const snap = snapshot();
    const project = Object.values(snap.projects!)[0];
    const section = Object.values(snap.sections!).find((s) => s.project_id === project.id)!;
    snap.tasks!["user-task"] = { ...Object.values(snap.tasks!)[0], id: "user-task", title: "Mine", project_id: project.id, section_id: section.id, parent_id: null };
    const { items, summary } = planDemoImport(snap, { userId: ME, workspaceId: WS, mode: "mine", newId });
    expect(summary).toMatchObject({ projects: 1, tasks: 1 });
    const task = items.find((i) => i.table === "tasks")!.row;
    const proj = items.find((i) => i.table === "projects")!.row;
    const sec = items.find((i) => i.table === "sections")!.row;
    expect(task.project_id).toBe(proj.id);
    expect(task.section_id).toBe(sec.id);
    expect(task.created_by).toBe(ME);
    expect(task.workspace_id).toBe(WS);
    expect(isSeedId(task.id)).toBe(false);
    expect(items.findIndex((i) => i.table === "projects")).toBeLessThan(items.findIndex((i) => i.table === "tasks"));
    // every item is an insert (a missing kind once turned the import into deletes)
    expect(items.every((i) => i.kind === "insert")).toBe(true);
  });

  it("brings sample rows the visitor changed, without the marker", () => {
    const snap = snapshot();
    const sample = Object.values(snap.tasks!).find((t) => !t.parent_id && t.project_id)!;
    snap.tasks![String(sample.id)] = { ...sample, status: "done", __demoEdited: true };
    const { items } = planDemoImport(snap, { userId: ME, workspaceId: WS, mode: "mine", newId });
    const task = items.find((i) => i.table === "tasks" && i.row.title === sample.title)!;
    expect(task.row).toMatchObject({ status: "done" });
    expect("__demoEdited" in task.row).toBe(false);
    expect(items.some((i) => i.table === "projects")).toBe(true);
  });

  it("re-points every reference and drops invented people in 'all' mode", () => {
    const { items } = planDemoImport(snapshot(), { userId: ME, workspaceId: WS, mode: "all", newId });
    const ids = new Set(items.map((i) => i.row.id).filter(Boolean));
    for (const { table, row } of items) {
      expect(row.workspace_id ?? WS).toBe(WS);
      if (table === "tasks" && row.project_id) expect(ids.has(row.project_id)).toBe(true);
      if (table === "tasks" && row.parent_id) expect(ids.has(row.parent_id)).toBe(true);
      if (table === "task_assignees") expect(row.user_id).toBe(ME);
      if (table === "checklist_items") expect(ids.has(row.task_id)).toBe(true);
      if (table === "key_results") expect(ids.has(row.goal_id)).toBe(true);
    }
    expect(items.some((i) => i.table === "notifications" || i.table === "workspace_members")).toBe(false);
    // no seed ids survive
    expect([...ids].some(isSeedId)).toBe(false);
  });
});
