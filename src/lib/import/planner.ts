// Import from the user's previous planner (JSON) and from CSV.
//
// Planner JSON: { tasks: [{ title, area, pri (1–3), top, done, note, due, created, bucket ("kun"|"hafta"|"keyin"), day }] }
//   area    → an area and a project of the same name (or an existing project/area, or the inbox — the
//             user confirms every new one in the preview)
//   pri     → 3 high, 2 medium, 1 low
//   top     → top 3 on the task's day (or today)
//   done    → status done
//   note    → description
//   bucket  → "kun": due date = day · "hafta": due date = coming Saturday · "keyin": no date
//   due     → deadline (kept as the hard deadline)
//   created → creation time, when present
//
// CSV: the user maps columns (title, project, area, due, deadline, priority, status, notes, created)
// in a preview of the first rows. Rows that cannot be read are skipped with a reason, and rows that
// already exist (same title, project and date) are flagged as duplicates.

import Papa from "papaparse";
import { z } from "zod";
import { colorFor, PROJECT_COLORS } from "../colors";
import { comingSaturday } from "../dates";
import { fold } from "../text";
import type { TaskPriority, TaskStatus } from "../types";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const plannerTask = z.object({
  title: z.string().trim().min(1).max(500),
  area: z.string().trim().max(120).nullish(),
  pri: z.coerce.number().int().min(0).max(3).nullish(),
  top: z.boolean().nullish(),
  done: z.boolean().nullish(),
  note: z.string().max(20_000).nullish(),
  due: isoDate.nullish(),
  created: z.union([z.string(), z.number()]).nullish(),
  bucket: z.enum(["kun", "hafta", "keyin"]).nullish(),
  day: isoDate.nullish(),
});

export const plannerSchema = z.object({ tasks: z.array(z.unknown()).max(5000) });

export type SkipReason = "empty_title" | "invalid_row" | "duplicate";

export interface ImportRow {
  /** 1-based line (CSV) or position (JSON), for the summary */
  line: number;
  title: string;
  /** planner area / CSV project text, used to group rows */
  group: string | null;
  /** CSV area column */
  areaName: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  deadline: string | null;
  topDate: string | null;
  note: string | null;
  createdAt: string | null;
}

export interface Skipped {
  line: number;
  title: string;
  reason: SkipReason;
}

export type AreaTarget = { kind: "existing"; areaId: string } | { kind: "new"; name: string; color: string } | null;
export type GroupTarget = { kind: "existing"; projectId: string } | { kind: "new"; projectName: string; color: string; area: AreaTarget } | { kind: "inbox" };

export interface ImportGroup {
  key: string;
  label: string;
  count: number;
  target: GroupTarget;
}

export interface ImportPlan {
  source: "planner" | "csv";
  rows: ImportRow[];
  groups: ImportGroup[];
  skipped: Skipped[];
  /** lines of rows that match an existing task */
  duplicates: number[];
}

export interface ImportContext {
  existingProjects: { id: string; name: string; area_id?: string | null }[];
  existingAreas?: { id: string; name: string }[];
  /** open and done tasks already in the workspace, for the duplicate check */
  existingTasks?: { title: string; project_id: string | null; due_date: string | null }[];
}

function niceName(s: string): string {
  const v = s.trim();
  return v ? v[0].toLocaleUpperCase("uz") + v.slice(1) : v;
}

const PRI: Record<number, TaskPriority> = { 3: "high", 2: "medium", 1: "low", 0: "none" };

function toIsoInstant(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  const d = typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ------------------------------------------------------------------ planner JSON

export function parsePlanner(input: unknown, today: string): { rows: ImportRow[]; skipped: Skipped[] } {
  const data = plannerSchema.parse(input);
  const saturday = comingSaturday(today);
  const rows: ImportRow[] = [];
  const skipped: Skipped[] = [];
  data.tasks.forEach((raw, i) => {
    const line = i + 1;
    const parsed = plannerTask.safeParse(raw);
    if (!parsed.success) {
      const title = typeof (raw as { title?: unknown })?.title === "string" ? String((raw as { title: string }).title) : "";
      skipped.push({ line, title, reason: title.trim() ? "invalid_row" : "empty_title" });
      return;
    }
    const t = parsed.data;
    let dueDate: string | null = null;
    if (t.bucket === "kun") dueDate = t.day ?? today;
    else if (t.bucket === "hafta") dueDate = saturday;
    else if (!t.bucket && t.day) dueDate = t.day;
    rows.push({
      line,
      title: t.title,
      group: t.area?.trim() || null,
      areaName: null,
      priority: PRI[t.pri ?? 0] ?? "none",
      status: t.done ? "done" : "todo",
      dueDate,
      deadline: t.due ?? null,
      topDate: t.top ? (t.bucket === "kun" && t.day ? t.day : today) : null,
      note: t.note?.trim() ? t.note.trim() : null,
      createdAt: toIsoInstant(t.created),
    });
  });
  return { rows, skipped };
}

/** Kept for callers that want the whole plan in one step. */
export function mapPlannerImport(input: unknown, opts: { today: string } & ImportContext): ImportPlan {
  const { rows, skipped } = parsePlanner(input, opts.today);
  return buildPlan("planner", rows, skipped, opts);
}

// ------------------------------------------------------------------ CSV

export const CSV_FIELDS = ["title", "project", "area", "due", "deadline", "priority", "status", "notes", "created"] as const;
export type CsvField = (typeof CSV_FIELDS)[number];
export type CsvMapping = Partial<Record<CsvField, string>>;

const GUESS: Record<CsvField, string[]> = {
  title: ["title", "name", "nomi", "vazifa", "task", "sarlavha"],
  project: ["project", "loyiha", "list", "roʻyxat", "ro'yxat"],
  area: ["area", "soha", "yo'nalish", "yoʻnalish", "category", "kategoriya"],
  due: ["due", "due date", "date", "sana", "muddat", "kun", "day"],
  deadline: ["deadline", "oxirgi muddat"],
  priority: ["priority", "muhimlik", "pri", "prioritet"],
  status: ["status", "holat", "done", "bajarildi"],
  notes: ["notes", "note", "description", "izoh", "tavsif"],
  created: ["created", "created_at", "yaratilgan", "created at"],
};

export function readCsvColumns(text: string): { headers: string[]; sample: Record<string, string>[]; guess: CsvMapping; total: number } {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: true });
  if (!parsed.meta.fields?.length) throw new Error(parsed.errors[0]?.message ?? "No header row");
  const headers = parsed.meta.fields;
  const guess: CsvMapping = {};
  for (const field of CSV_FIELDS) {
    const hit = headers.find((h) => GUESS[field].includes(fold(h)) && !Object.values(guess).includes(h));
    if (hit) guess[field] = hit;
  }
  return { headers, sample: parsed.data.slice(0, 10), guess, total: parsed.data.length };
}

const CSV_PRIORITY: Record<string, TaskPriority> = {
  urgent: "urgent", shoshilinch: "urgent", "1": "urgent", p1: "urgent", "!1": "urgent",
  high: "high", yuqori: "high", "2": "high", p2: "high", "!2": "high",
  medium: "medium", "o'rta": "medium", orta: "medium", "3": "medium", p3: "medium", "!3": "medium",
  low: "low", past: "low", "4": "low", p4: "low", "!4": "low",
};
const CSV_STATUS: Record<string, TaskStatus> = {
  todo: "todo", "to do": "todo", open: "todo", "bajarilishi kerak": "todo", false: "todo", no: "todo", "0": "todo",
  in_progress: "in_progress", "in progress": "in_progress", doing: "in_progress", jarayonda: "in_progress",
  waiting: "waiting", blocked: "waiting", kutilmoqda: "waiting",
  done: "done", completed: "done", bajarildi: "done", "1": "done", true: "done", yes: "done", ha: "done",
  cancelled: "cancelled", canceled: "cancelled", "bekor qilingan": "cancelled",
};

export function parseCsvDate(v: string | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s); // 15.10.2026, 15/10/2026, 15-10-2026
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export function parseCsv(text: string, mapping: CsvMapping): { rows: ImportRow[]; skipped: Skipped[] } {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: true });
  if (parsed.data.length > 5000) throw new Error("Too many rows (max 5000)");
  const get = (r: Record<string, string>, f: CsvField) => (mapping[f] ? (r[mapping[f]!] ?? "").trim() : "");
  const rows: ImportRow[] = [];
  const skipped: Skipped[] = [];
  parsed.data.forEach((r, i) => {
    const line = i + 2; // header is line 1
    const title = get(r, "title").slice(0, 500);
    if (!title) {
      skipped.push({ line, title: "", reason: "empty_title" });
      return;
    }
    rows.push({
      line,
      title,
      group: get(r, "project") || null,
      areaName: get(r, "area") || null,
      priority: CSV_PRIORITY[fold(get(r, "priority"))] ?? "none",
      status: CSV_STATUS[fold(get(r, "status"))] ?? "todo",
      dueDate: parseCsvDate(get(r, "due")),
      deadline: parseCsvDate(get(r, "deadline")),
      topDate: null,
      note: get(r, "notes") || null,
      createdAt: toIsoInstant(get(r, "created")),
    });
  });
  return { rows, skipped };
}

/** Whole CSV plan with guessed columns (tests and quick imports). */
export function mapCsvImport(text: string, opts: ImportContext): ImportPlan {
  const { guess } = readCsvColumns(text);
  const { rows, skipped } = parseCsv(text, guess);
  return buildPlan("csv", rows, skipped, opts);
}

// ------------------------------------------------------------------ plan

export function buildPlan(source: ImportPlan["source"], rows: ImportRow[], skipped: Skipped[], ctx: ImportContext): ImportPlan {
  const projectByName = new Map(ctx.existingProjects.map((p) => [fold(p.name), p]));
  const areaByName = new Map((ctx.existingAreas ?? []).map((a) => [fold(a.name), a]));
  const used = new Set<string>();
  const pickColor = (key: string) => {
    let color = colorFor(key);
    if (used.has(color)) color = PROJECT_COLORS.find((c) => !used.has(c)) ?? color;
    used.add(color);
    return color;
  };

  const groups: ImportGroup[] = [];
  for (const row of rows) {
    if (!row.group) continue;
    const key = fold(row.group);
    const existing = groups.find((g) => g.key === key);
    if (existing) {
      existing.count++;
      continue;
    }
    const project = projectByName.get(key);
    let target: GroupTarget;
    if (project) target = { kind: "existing", projectId: project.id };
    else {
      // planner areas are life areas: the project goes into an area of the same name;
      // for CSV the area comes from its own column, if any
      const areaName = source === "planner" ? row.group : row.areaName;
      let area: AreaTarget = null;
      if (areaName) {
        const a = areaByName.get(fold(areaName));
        area = a ? { kind: "existing", areaId: a.id } : { kind: "new", name: niceName(areaName), color: "" };
      }
      const color = pickColor(key);
      if (area?.kind === "new") area.color = color;
      target = { kind: "new", projectName: niceName(row.group), color, area };
    }
    groups.push({ key, label: niceName(row.group), count: 1, target });
  }

  // same title, same project, same date as a task that is already there
  const seen = new Set(
    (ctx.existingTasks ?? []).map((t) => {
      const projectName = ctx.existingProjects.find((p) => p.id === t.project_id)?.name ?? "";
      return `${fold(t.title)}|${fold(projectName)}|${t.due_date ?? ""}`;
    }),
  );
  const duplicates: number[] = [];
  for (const row of rows) {
    const g = row.group ? groups.find((x) => x.key === fold(row.group!)) : undefined;
    const projectName = g?.target.kind === "existing" ? (ctx.existingProjects.find((p) => p.id === (g.target as { projectId: string }).projectId)?.name ?? "") : "";
    const key = `${fold(row.title)}|${fold(projectName)}|${row.dueDate ?? ""}`;
    if (g?.target.kind !== "new" && seen.has(key)) duplicates.push(row.line);
  }

  return { source, rows, groups, skipped, duplicates };
}

/** Rows that will be created, and the full skip list, for a plan and the user's choices. */
export function finalizePlan(plan: ImportPlan, opts: { skipDuplicates: boolean }): { rows: ImportRow[]; skipped: Skipped[] } {
  const dup = new Set(opts.skipDuplicates ? plan.duplicates : []);
  const rows = plan.rows.filter((r) => !dup.has(r.line));
  const skipped = [...plan.skipped, ...plan.rows.filter((r) => dup.has(r.line)).map((r) => ({ line: r.line, title: r.title, reason: "duplicate" as const }))].sort(
    (a, b) => a.line - b.line,
  );
  return { rows, skipped };
}
