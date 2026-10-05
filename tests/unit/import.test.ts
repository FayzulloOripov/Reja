import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPlan, finalizePlan, mapCsvImport, mapPlannerImport, parseCsv, parsePlanner, readCsvColumns } from "@/lib/import/planner";

const today = "2026-10-05"; // Monday → coming Saturday is 2026-10-10

const sample = {
  tasks: [
    { title: "Sentabr oyligini yakunlash", area: "topcoach", pri: 3, top: true, done: false, note: "Sariq kataklar", due: null, bucket: "kun", day: "2026-10-05" },
    { title: "Video yozish", area: "agentlik", pri: 3, top: true, done: false, note: "", due: "2026-10-10", bucket: "kun", day: "2026-10-06", created: "2026-09-30T08:00:00Z" },
    { title: "Oktabr maqsadi", area: "topcoach", pri: 2, top: false, done: false, note: "", due: null, bucket: "hafta", day: null },
    { title: "Garderob", area: "shaxsiy", pri: 1, top: false, done: true, note: "", due: null, bucket: "keyin", day: null },
  ],
};

describe("planner JSON import", () => {
  it("maps fields as specified", () => {
    const { rows } = parsePlanner(sample, today);
    expect(rows.map((r) => ({ ...r, line: undefined }))).toEqual([
      { title: "Sentabr oyligini yakunlash", group: "topcoach", areaName: null, priority: "high", status: "todo", dueDate: "2026-10-05", deadline: null, topDate: "2026-10-05", note: "Sariq kataklar", createdAt: null, line: undefined },
      { title: "Video yozish", group: "agentlik", areaName: null, priority: "high", status: "todo", dueDate: "2026-10-06", deadline: "2026-10-10", topDate: "2026-10-06", note: null, createdAt: "2026-09-30T08:00:00.000Z", line: undefined },
      { title: "Oktabr maqsadi", group: "topcoach", areaName: null, priority: "medium", status: "todo", dueDate: "2026-10-10", deadline: null, topDate: null, note: null, createdAt: null, line: undefined },
      { title: "Garderob", group: "shaxsiy", areaName: null, priority: "low", status: "done", dueDate: null, deadline: null, topDate: null, note: null, createdAt: null, line: undefined },
    ]);
  });

  it("maps each planner area to an existing project, or to a new project in an area of the same name", () => {
    const plan = mapPlannerImport(sample, { today, existingProjects: [{ id: "p1", name: "Topcoach" }], existingAreas: [{ id: "a1", name: "Shaxsiy" }] });
    const byKey = Object.fromEntries(plan.groups.map((g) => [g.key, g]));
    expect(byKey.topcoach.target).toEqual({ kind: "existing", projectId: "p1" });
    expect(byKey.topcoach.count).toBe(2);
    expect(byKey.agentlik.target).toMatchObject({ kind: "new", projectName: "Agentlik", area: { kind: "new", name: "Agentlik" } });
    expect(byKey.shaxsiy.target).toMatchObject({ kind: "new", projectName: "Shaxsiy", area: { kind: "existing", areaId: "a1" } });
  });

  it("gives new projects distinct colours", () => {
    const plan = mapPlannerImport(sample, { today, existingProjects: [] });
    const colors = plan.groups.map((g) => (g.target.kind === "new" ? g.target.color : ""));
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("skips unreadable rows with a reason instead of failing the whole file", () => {
    const { rows, skipped } = parsePlanner({ tasks: [{ title: "" }, { title: "ok" }, { title: "bad", bucket: "someday" }] }, today);
    expect(rows.map((r) => r.title)).toEqual(["ok"]);
    expect(skipped).toEqual([
      { line: 1, title: "", reason: "empty_title" },
      { line: 3, title: "bad", reason: "invalid_row" },
    ]);
    expect(() => parsePlanner({ items: [] }, today)).toThrow();
  });

  it("flags tasks that already exist and skips them on request", () => {
    const plan = mapPlannerImport(sample, {
      today,
      existingProjects: [{ id: "p1", name: "Topcoach" }],
      existingTasks: [{ title: "Sentabr oyligini YAKUNLASH", project_id: "p1", due_date: "2026-10-05" }],
    });
    expect(plan.duplicates).toEqual([1]);
    const kept = finalizePlan(plan, { skipDuplicates: true });
    expect(kept.rows).toHaveLength(3);
    expect(kept.skipped).toEqual([{ line: 1, title: "Sentabr oyligini yakunlash", reason: "duplicate" }]);
    expect(finalizePlan(plan, { skipDuplicates: false }).rows).toHaveLength(4);
  });

  it("imports the real export file when present", () => {
    let raw: string;
    try {
      raw = readFileSync(`${process.env.HOME}/Downloads/planner-export.json`, "utf8");
    } catch {
      return; // file only exists on the author's machine
    }
    const plan = mapPlannerImport(JSON.parse(raw), { today, existingProjects: [] });
    expect(plan.rows.length).toBe(30);
    expect(plan.skipped).toEqual([]);
    expect(plan.groups.map((g) => g.label).sort()).toEqual(["Agentlik", "Shaxsiy", "Shiroq", "Topcoach", "Xijoma"]);
    expect(plan.rows.filter((t) => t.topDate === "2026-10-05")).toHaveLength(3);
    expect(plan.rows.filter((t) => t.topDate === "2026-10-06")).toHaveLength(3);
    expect(plan.rows.filter((t) => t.dueDate === "2026-10-10").length).toBeGreaterThan(5);
  });
});

describe("CSV import", () => {
  const csv = "﻿Title,Project,Due,Priority,Status,Notes\nHisobot,Topcoach,2026-10-12,high,todo,Muhim\nToʻlov,,15.10.2026,!1,bajarildi,\n,Topcoach,,,,\n";

  it("guesses the column mapping and shows the first rows", () => {
    const cols = readCsvColumns(csv);
    expect(cols.guess).toMatchObject({ title: "Title", project: "Project", due: "Due", priority: "Priority", status: "Status", notes: "Notes" });
    expect(cols.sample).toHaveLength(3);
    expect(cols.total).toBe(3);
  });

  it("reads rows with the chosen mapping (BOM, Uzbek values, dd.mm.yyyy dates)", () => {
    const plan = mapCsvImport(csv, { existingProjects: [] });
    expect(plan.groups.map((g) => g.label)).toEqual(["Topcoach"]);
    expect(plan.rows[0]).toMatchObject({ title: "Hisobot", group: "Topcoach", dueDate: "2026-10-12", priority: "high", status: "todo", note: "Muhim" });
    expect(plan.rows[1]).toMatchObject({ title: "Toʻlov", group: null, dueDate: "2026-10-15", status: "done", priority: "urgent" });
    expect(plan.skipped).toEqual([{ line: 4, title: "", reason: "empty_title" }]);
  });

  it("lets the user map differently named columns", () => {
    const text = "Vazifa,Sana boshqa,Loyiha nomi\nQoʻngʻiroq,05/11/2026,Shiroq\n";
    const { rows } = parseCsv(text, { title: "Vazifa", due: "Sana boshqa", project: "Loyiha nomi" });
    expect(rows[0]).toMatchObject({ title: "Qoʻngʻiroq", dueDate: "2026-11-05", group: "Shiroq" });
    const plan = buildPlan("csv", rows, [], { existingProjects: [] });
    expect(plan.groups[0].target).toMatchObject({ kind: "new", projectName: "Shiroq", area: null });
  });
});
