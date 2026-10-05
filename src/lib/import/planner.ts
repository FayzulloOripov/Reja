// Import from the user's previous planner (JSON) and from CSV.
//
// Planner JSON: { tasks: [{ title, area, pri (1–3), top, done, note, due, bucket ("kun"|"hafta"|"keyin"), day }] }
//   area   → project (created if missing)
//   pri    → 3 high, 2 medium, 1 low
//   top    → top 3 on the task's day (or today)
//   done   → status done
//   note   → description
//   bucket → "kun": due date = day · "hafta": due date = coming Saturday · "keyin": no date
//   due    → deadline (kept as the hard deadline)

import Papa from "papaparse";
import { z } from "zod";
import { comingSaturday } from "../dates";
import { colorFor, PROJECT_COLORS } from "../colors";
import { fold } from "../text";
import type { TaskPriority, TaskStatus } from "../types";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const plannerSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(500),
        area: z.string().trim().max(120).nullish(),
        pri: z.coerce.number().int().min(0).max(3).nullish(),
        top: z.boolean().nullish(),
        done: z.boolean().nullish(),
        note: z.string().max(20_000).nullish(),
        due: isoDate.nullish(),
        bucket: z.enum(["kun", "hafta", "keyin"]).nullish(),
        day: isoDate.nullish(),
      }),
    )
    .max(5000),
});

export interface ImportedTask {
  title: string;
  projectKey: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  deadline: string | null;
  topDate: string | null;
  note: string | null;
}

export interface ImportPlan {
  /** projects to create, keyed by folded name */
  newProjects: { key: string; name: string; color: string }[];
  /** existing project id by folded name */
  existing: Record<string, string>;
  tasks: ImportedTask[];
}

function projectName(area: string): string {
  const s = area.trim();
  return s ? s[0].toLocaleUpperCase("uz") + s.slice(1) : s;
}

const PRI: Record<number, TaskPriority> = { 3: "high", 2: "medium", 1: "low", 0: "none" };

function resolveProjects(names: string[], existingProjects: { id: string; name: string }[]) {
  const existing: Record<string, string> = {};
  for (const p of existingProjects) existing[fold(p.name)] = p.id;
  const newProjects: ImportPlan["newProjects"] = [];
  const used = new Set<string>();
  for (const raw of names) {
    const key = fold(raw);
    if (!key || existing[key] || newProjects.some((p) => p.key === key)) continue;
    let color = colorFor(key);
    if (used.has(color)) color = PROJECT_COLORS.find((c) => !used.has(c)) ?? color;
    used.add(color);
    newProjects.push({ key, name: projectName(raw), color });
  }
  return { existing, newProjects };
}

export function mapPlannerImport(input: unknown, opts: { today: string; existingProjects: { id: string; name: string }[] }): ImportPlan {
  const data = plannerSchema.parse(input);
  const areas = data.tasks.map((t) => t.area ?? "").filter(Boolean);
  const { existing, newProjects } = resolveProjects(areas, opts.existingProjects);
  const saturday = comingSaturday(opts.today);

  const tasks: ImportedTask[] = data.tasks.map((t) => {
    let dueDate: string | null = null;
    if (t.bucket === "kun") dueDate = t.day ?? opts.today;
    else if (t.bucket === "hafta") dueDate = saturday;
    else if (!t.bucket && t.day) dueDate = t.day;
    return {
      title: t.title,
      projectKey: t.area ? fold(t.area) : null,
      priority: PRI[t.pri ?? 0] ?? "none",
      status: t.done ? "done" : "todo",
      dueDate,
      deadline: t.due ?? null,
      topDate: t.top ? (t.bucket === "kun" && t.day ? t.day : opts.today) : null,
      note: t.note?.trim() ? t.note.trim() : null,
    };
  });
  return { newProjects, existing, tasks };
}

// ------------------------------------------------------------------ CSV

const CSV_PRIORITY: Record<string, TaskPriority> = {
  urgent: "urgent", shoshilinch: "urgent", "1": "urgent", p1: "urgent",
  high: "high", yuqori: "high", "2": "high", p2: "high",
  medium: "medium", "o'rta": "medium", orta: "medium", "3": "medium", p3: "medium",
  low: "low", past: "low", "4": "low", p4: "low",
};
const CSV_STATUS: Record<string, TaskStatus> = {
  todo: "todo", "to do": "todo", open: "todo", "bajarilishi kerak": "todo",
  in_progress: "in_progress", "in progress": "in_progress", doing: "in_progress", jarayonda: "in_progress",
  waiting: "waiting", blocked: "waiting", kutilmoqda: "waiting",
  done: "done", completed: "done", bajarildi: "done", "1": "done", true: "done", yes: "done",
  cancelled: "cancelled", canceled: "cancelled", "bekor qilingan": "cancelled",
};

function parseCsvDate(v: string | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s); // 15.10.2026 or 15/10/2026
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export function mapCsvImport(text: string, opts: { existingProjects: { id: string; name: string }[] }): ImportPlan {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: true, transformHeader: (h) => fold(h) });
  if (parsed.errors.length && !parsed.data.length) throw new Error(parsed.errors[0].message);
  const rows = parsed.data.filter((r) => (r.title ?? r.name ?? r.nomi ?? "").trim());
  if (rows.length > 5000) throw new Error("Too many rows (max 5000)");
  const names = rows.map((r) => r.project ?? r.loyiha ?? "").filter(Boolean);
  const { existing, newProjects } = resolveProjects(names, opts.existingProjects);
  return {
    existing,
    newProjects,
    tasks: rows.map((r) => {
      const project = (r.project ?? r.loyiha ?? "").trim();
      return {
        title: (r.title ?? r.name ?? r.nomi).trim().slice(0, 500),
        projectKey: project ? fold(project) : null,
        priority: CSV_PRIORITY[fold(r.priority ?? r.muhimlik ?? "")] ?? "none",
        status: CSV_STATUS[fold(r.status ?? r.holat ?? "")] ?? "todo",
        dueDate: parseCsvDate(r.due ?? r.muddat),
        deadline: parseCsvDate(r.deadline),
        topDate: null,
        note: (r.notes ?? r.note ?? r.description ?? r.izoh ?? "").trim() || null,
      };
    }),
  };
}
