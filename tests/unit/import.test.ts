import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapCsvImport, mapPlannerImport } from "@/lib/import/planner";

const today = "2026-10-05"; // Monday → coming Saturday is 2026-10-10

const sample = {
  tasks: [
    { title: "Sentabr oyligini yakunlash", area: "topcoach", pri: 3, top: true, done: false, note: "Sariq kataklar", due: null, bucket: "kun", day: "2026-10-05" },
    { title: "Video yozish", area: "agentlik", pri: 3, top: true, done: false, note: "", due: "2026-10-10", bucket: "kun", day: "2026-10-06" },
    { title: "Oktabr maqsadi", area: "topcoach", pri: 2, top: false, done: false, note: "", due: null, bucket: "hafta", day: null },
    { title: "Garderob", area: "shaxsiy", pri: 1, top: false, done: true, note: "", due: null, bucket: "keyin", day: null },
  ],
};

describe("planner JSON import", () => {
  it("maps fields as specified", () => {
    const plan = mapPlannerImport(sample, { today, existingProjects: [{ id: "p1", name: "Topcoach" }] });
    expect(plan.existing).toMatchObject({ topcoach: "p1" });
    expect(plan.newProjects.map((p) => p.name)).toEqual(["Agentlik", "Shaxsiy"]);
    expect(plan.tasks).toEqual([
      { title: "Sentabr oyligini yakunlash", projectKey: "topcoach", priority: "high", status: "todo", dueDate: "2026-10-05", deadline: null, topDate: "2026-10-05", note: "Sariq kataklar" },
      { title: "Video yozish", projectKey: "agentlik", priority: "high", status: "todo", dueDate: "2026-10-06", deadline: "2026-10-10", topDate: "2026-10-06", note: null },
      { title: "Oktabr maqsadi", projectKey: "topcoach", priority: "medium", status: "todo", dueDate: "2026-10-10", deadline: null, topDate: null, note: null },
      { title: "Garderob", projectKey: "shaxsiy", priority: "low", status: "done", dueDate: null, deadline: null, topDate: null, note: null },
    ]);
  });

  it("gives new projects distinct colours", () => {
    const plan = mapPlannerImport(sample, { today, existingProjects: [] });
    const colors = plan.newProjects.map((p) => p.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("rejects malformed files", () => {
    expect(() => mapPlannerImport({ tasks: [{ title: "" }] }, { today, existingProjects: [] })).toThrow();
    expect(() => mapPlannerImport({ items: [] }, { today, existingProjects: [] })).toThrow();
    expect(() => mapPlannerImport({ tasks: [{ title: "x", bucket: "someday" }] }, { today, existingProjects: [] })).toThrow();
  });

  it("imports the real export file when present", () => {
    let raw: string;
    try {
      raw = readFileSync(`${process.env.HOME}/Downloads/planner-export.json`, "utf8");
    } catch {
      return; // file only exists on the author's machine
    }
    const plan = mapPlannerImport(JSON.parse(raw), { today, existingProjects: [] });
    expect(plan.tasks.length).toBe(30);
    expect(plan.newProjects.map((p) => p.name).sort()).toEqual(["Agentlik", "Shaxsiy", "Shiroq", "Topcoach", "Xijoma"]);
    expect(plan.tasks.filter((t) => t.topDate === "2026-10-05")).toHaveLength(3);
    expect(plan.tasks.filter((t) => t.topDate === "2026-10-06")).toHaveLength(3);
    expect(plan.tasks.filter((t) => t.dueDate === "2026-10-10").length).toBeGreaterThan(5);
  });
});

describe("CSV import", () => {
  it("reads title, project, due, priority, status, notes (with BOM and Uzbek values)", () => {
    const csv = "﻿Title,Project,Due,Priority,Status,Notes\nHisobot,Topcoach,2026-10-12,high,todo,Muhim\nToʻlov,,15.10.2026,!1,bajarildi,\n";
    const plan = mapCsvImport(csv, { existingProjects: [] });
    expect(plan.newProjects.map((p) => p.name)).toEqual(["Topcoach"]);
    expect(plan.tasks[0]).toMatchObject({ title: "Hisobot", projectKey: "topcoach", dueDate: "2026-10-12", priority: "high", status: "todo", note: "Muhim" });
    expect(plan.tasks[1]).toMatchObject({ title: "Toʻlov", projectKey: null, dueDate: "2026-10-15", status: "done" });
  });
});
