"use client";

// Running an import (planner JSON or CSV). Kept apart from the other actions so the parser and its
// schema (papaparse, zod) load only on the import screen.

import { finalizePlan, type ImportPlan, type Skipped } from "@/lib/import/planner";
import { fold } from "@/lib/text";
import type { RichDoc } from "@/lib/types";
import { newArea, newProject, newTask } from "./factories";
import { mutate, useStore, type MutationInput } from "./store";

const uid = () => useStore.getState().userId ?? "";
const nowIso = () => new Date().toISOString();

/**
 * Create the areas, projects and tasks of an import plan in one optimistic batch.
 * Returns how many tasks were added and which rows were skipped (with the reason).
 */
export function runImport(plan: ImportPlan, workspaceId: string, opts: { skipDuplicates: boolean } = { skipDuplicates: true }): { added: number; skipped: Skipped[] } {
  const { rows, skipped } = finalizePlan(plan, opts);
  const ops: MutationInput[] = [];
  const areaIds: Record<string, string> = {};
  const projectIds: Record<string, string | null> = {};
  const usedGroups = new Set(rows.map((r) => (r.group ? fold(r.group) : "")));
  let pos = Date.now();
  for (const g of plan.groups) {
    if (!usedGroups.has(g.key)) continue;
    const target = g.target;
    if (target.kind === "existing") projectIds[g.key] = target.projectId;
    else if (target.kind === "inbox") projectIds[g.key] = null;
    else {
      let areaId: string | null = null;
      if (target.area?.kind === "existing") areaId = target.area.areaId;
      else if (target.area?.kind === "new") {
        const k = fold(target.area.name);
        if (!areaIds[k]) {
          const area = newArea({ workspace_id: workspaceId, name: target.area.name, color: target.area.color || target.color, owner_id: uid(), position: pos++ });
          ops.push({ table: "areas", kind: "insert", row: area });
          areaIds[k] = area.id;
        }
        areaId = areaIds[k];
      }
      const project = newProject({ workspace_id: workspaceId, name: target.projectName, color: target.color, owner_id: uid(), area_id: areaId, position: pos++ });
      ops.push({ table: "projects", kind: "insert", row: project });
      projectIds[g.key] = project.id;
    }
  }
  for (const t of rows) {
    const projectId = t.group ? (projectIds[fold(t.group)] ?? null) : null;
    const task = newTask({
      workspace_id: workspaceId,
      project_id: projectId,
      title: t.title,
      priority: t.priority,
      status: t.status,
      completed_at: t.status === "done" ? nowIso() : null,
      due_date: t.dueDate,
      deadline: t.deadline,
      top_date: t.topDate,
      description: textDoc(t.note),
      created_by: uid(),
      source: "import",
      position: pos++,
      ...(t.createdAt ? { created_at: t.createdAt } : {}),
    });
    ops.push({ table: "tasks", kind: "insert", row: task });
  }
  if (ops.length) mutate(ops);
  return { added: rows.length, skipped };
}

function textDoc(text: string | null): RichDoc {
  if (!text) return null;
  return { type: "doc", content: text.split(/\n+/).map((line) => ({ type: "paragraph", content: line ? [{ type: "text", text: line }] : [] })) };
}
