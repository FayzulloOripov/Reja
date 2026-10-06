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

describe("planDemoImport — organisation", () => {
  const today = "2026-10-06";
  const demo = buildDemoData(DEMO_USER_ID, today, "Asia/Tashkent", "uz");
  const snap: Snapshot = Object.fromEntries(
    Object.entries(demo).map(([table, rows]) => [table, Object.fromEntries((rows as Record<string, unknown>[]).map((r) => [String(r.id ?? `${r.task_id}|${r.user_id}`), r]))]),
  );
  let n = 0;
  const plan = planDemoImport(snap, { userId: "me", workspaceId: "ws", mode: "all", newId: () => `new-${++n}` });
  const of = (table: string) => plan.items.filter((i) => i.table === table).map((i) => i.row);

  it("brings contacts, meetings with items, routines and reviews, re-pointed to the new ids", () => {
    expect(of("contacts")).toHaveLength(demo.contacts.length);
    expect(of("meetings")).toHaveLength(demo.meetings.length);
    expect(of("meeting_items")).toHaveLength(demo.meeting_items.length);
    expect(of("routines")).toHaveLength(demo.routines.length);
    expect(of("weekly_reviews")).toHaveLength(1);
    const meetingIds = new Set(of("meetings").map((m) => m.id));
    for (const i of of("meeting_items")) expect(meetingIds.has(i.meeting_id)).toBe(true);
    // attendees: the demo user becomes me, the invented partner is dropped, contacts stay
    const att = of("meeting_attendees");
    expect(att.every((a) => a.user_id === "me" || (a.user_id === null && a.contact_id))).toBe(true);
    expect(att.some((a) => a.contact_id)).toBe(true);
  });

  it("keeps waiting on a contact, drops waiting on the invented partner", () => {
    const tasks = of("tasks");
    const contactIds = new Set(of("contacts").map((c) => c.id));
    const onContact = tasks.find((x) => x.title === "TexnoSoft dan CRM narxini olish")!;
    expect(contactIds.has(onContact.waiting_on_contact_id)).toBe(true);
    expect(onContact.status).toBe("waiting");
    const onPartner = tasks.find((x) => x.title === "Reklama byudjetini tasdiqlash")!;
    expect(onPartner).toMatchObject({ waiting_on_user_id: null, waiting_on_contact_id: null, status: "todo", waiting_since: null });
  });

  it("only what I entered: a ticked sample routine comes along with today's run", () => {
    const run = demo.routine_runs[0];
    const mine = { ...snap, routine_runs: { [run.id]: { ...run, checked: ["r1", "r2"], __demoEdited: true } } } as Snapshot;
    const p = planDemoImport(mine, { userId: "me", workspaceId: "ws", mode: "mine", newId: () => `m-${++n}` });
    expect(p.items.filter((i) => i.table === "routines")).toHaveLength(1);
    expect(p.items.find((i) => i.table === "routine_runs")!.row).toMatchObject({ user_id: "me", checked: ["r1", "r2"] });
  });
});
