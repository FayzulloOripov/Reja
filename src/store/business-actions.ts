"use client";

// Business modules: switching them on, pipeline deals, money entries with approvals, document
// versions and linked tasks. Optimistic like the rest of the store.

import { showUndo } from "@/components/common/undo-toast";
import { todayIn } from "@/lib/dates";
import { tr } from "@/lib/i18n-client";
import { needsApproval, toUzs } from "@/lib/money";
import { DEFAULT_STAGES } from "@/lib/pipeline";
import type { Deal, DealStage, MoneyEntry, MoneySplit, Note, NoteVersion, ProjectTemplateData, Workspace, WorkspaceModules } from "@/lib/types";
import { createProject, updateNote, updateWorkspace } from "./actions";
import { uuid } from "./factories";
import { mutate, useStore, type MutationInput } from "./store";

const S = () => useStore.getState();
const uid = () => S().userId ?? "";
const me = () => S().data.profiles[uid()];
const tz = () => me()?.timezone || "Asia/Tashkent";
const nowIso = () => new Date().toISOString();
const undo = (message: string, inverse: MutationInput[]) => showUndo(message, () => mutate(inverse));

// ------------------------------------------------------------------ modules & settings

/** Switch a module on or off for a workspace. The first time the pipeline is on, it gets default stages. */
export function setModule(ws: Workspace, key: keyof WorkspaceModules, on: boolean) {
  updateWorkspace(ws.id, { modules: { ...ws.modules, [key]: on } });
  if (key === "pipeline" && on && !Object.values(S().data.deal_stages).some((s) => s.workspace_id === ws.id)) {
    const lang = me()?.language === "en" ? "en" : "uz";
    mutate(
      DEFAULT_STAGES.map((st, i) => ({
        table: "deal_stages" as const,
        kind: "insert" as const,
        row: { id: uuid(), workspace_id: ws.id, name: st.name[lang], kind: st.kind, color: st.color, position: i + 1, created_at: nowIso(), updated_at: nowIso() },
      })),
    );
  }
}

export function updateMoneySettings(ws: Workspace, values: { usd_rate?: number; approval_threshold_uzs?: number | null; money_split?: MoneySplit | null }) {
  updateWorkspace(ws.id, values);
}

// ------------------------------------------------------------------ pipeline

export function createStage(workspaceId: string, name: string, kind: DealStage["kind"] = "open"): DealStage {
  const stage: DealStage = { id: uuid(), workspace_id: workspaceId, name: name.trim(), kind, color: "teal", position: Date.now(), created_at: nowIso(), updated_at: nowIso() };
  mutate([{ table: "deal_stages", kind: "insert", row: stage }]);
  return stage;
}

export function updateStage(id: string, values: Partial<DealStage>) {
  mutate([{ table: "deal_stages", kind: "update", row: { id }, values }]);
}

/** A stage can go only when no deal is in it. Returns false when it still holds deals. */
export function deleteStage(stage: DealStage): boolean {
  if (Object.values(S().data.deals).some((d) => d.stage_id === stage.id && !d.deleted_at)) return false;
  undo(tr("common.deleted"), mutate([{ table: "deal_stages", kind: "delete", row: { id: stage.id } }]));
  return true;
}

export type DealInput = Partial<Omit<Deal, "id" | "workspace_id">> & { title: string; stage_id: string };

export function createDeal(workspaceId: string, input: DealInput): Deal {
  const deal: Deal = {
    id: uuid(),
    workspace_id: workspaceId,
    value: null,
    currency: "UZS",
    owner_id: uid(),
    contact_id: null,
    source: null,
    next_step: null,
    next_step_date: null,
    lost_reason: null,
    project_id: null,
    position: Date.now(),
    stage_changed_at: nowIso(),
    closed_at: null,
    created_by: uid(),
    deleted_at: null,
    created_at: nowIso(),
    updated_at: nowIso(),
    ...input,
    title: input.title.trim(),
  };
  mutate([{ table: "deals", kind: "insert", row: deal }]);
  return deal;
}

export function updateDeal(id: string, values: Partial<Deal>) {
  mutate([{ table: "deals", kind: "update", row: { id }, values }]);
}

/** Move a deal to another stage (a lost stage needs a reason). Stamps like the database does. */
export function moveDeal(deal: Deal, stage: DealStage, lostReason?: string) {
  if (stage.id === deal.stage_id) return;
  const values: Partial<Deal> = {
    stage_id: stage.id,
    stage_changed_at: nowIso(),
    closed_at: stage.kind === "open" ? null : nowIso(),
  };
  if (stage.kind === "lost") values.lost_reason = lostReason?.trim() || deal.lost_reason;
  const ops: MutationInput[] = [{ table: "deals", kind: "update", row: { id: deal.id }, values }];
  undo(tr("pipeline.moved", { stage: stage.name }), mutate(ops));
}

export function deleteDeal(deal: Deal) {
  undo(tr("common.deleted"), mutate([{ table: "deals", kind: "update", row: { id: deal.id }, values: { deleted_at: nowIso() } }]));
}

/** A won deal becomes a project (optionally from a template); the deal keeps a link to it. */
export function dealToProject(deal: Deal, template?: ProjectTemplateData) {
  const project = createProject(
    { workspace_id: deal.workspace_id, name: deal.title, color: template?.color ?? "emerald" },
    template ? { sections: template.sections, tasks: template.tasks } : undefined,
  );
  mutate([{ table: "deals", kind: "update", row: { id: deal.id }, values: { project_id: project.id } }]);
  return project;
}

// ------------------------------------------------------------------ money

export type MoneyInput = Pick<MoneyEntry, "kind" | "amount" | "currency" | "date" | "method"> &
  Partial<Pick<MoneyEntry, "project_id" | "partner_id" | "category" | "note" | "direct" | "rate">>;

export function createMoneyEntry(ws: Workspace, input: MoneyInput): MoneyEntry {
  const rate = input.currency === "USD" ? (input.rate ?? ws.usd_rate) : null;
  const amount_uzs = toUzs({ amount: input.amount, currency: input.currency, rate });
  const entry: MoneyEntry = {
    id: uuid(),
    workspace_id: ws.id,
    project_id: null,
    partner_id: uid(),
    category: null,
    note: null,
    direct: false,
    ...input,
    rate,
    amount_uzs,
    // the database decides; this mirrors it so the screen is right before the echo
    status: needsApproval(input.kind, amount_uzs, ws.approval_threshold_uzs) ? "pending" : "approved",
    approved_by: null,
    approved_at: null,
    created_by: uid(),
    deleted_at: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  mutate([{ table: "money_entries", kind: "insert", row: entry }]);
  return entry;
}

export function updateMoneyEntry(entry: MoneyEntry, values: Partial<MoneyEntry>, ws: Workspace) {
  const next = { ...entry, ...values };
  const v: Partial<MoneyEntry> = { ...values };
  if (values.amount !== undefined || values.currency !== undefined || values.rate !== undefined) {
    v.rate = next.currency === "USD" ? (next.rate ?? ws.usd_rate) : null;
    v.amount_uzs = toUzs({ amount: next.amount, currency: next.currency, rate: v.rate });
    if (needsApproval(next.kind, v.amount_uzs, ws.approval_threshold_uzs)) v.status = "pending";
  }
  mutate([{ table: "money_entries", kind: "update", row: { id: entry.id }, values: v }]);
}

/** Approve or reject someone else's large expense. */
export function decideEntry(entry: MoneyEntry, approve: boolean) {
  mutate([
    {
      table: "money_entries",
      kind: "update",
      row: { id: entry.id },
      values: { status: approve ? "approved" : "rejected", approved_by: uid(), approved_at: nowIso() },
    },
  ]);
}

export function deleteMoneyEntry(entry: MoneyEntry) {
  undo(tr("common.deleted"), mutate([{ table: "money_entries", kind: "update", row: { id: entry.id }, values: { deleted_at: nowIso() } }]));
}

export function thisMonth(): string {
  return todayIn(tz()).slice(0, 7);
}

// ------------------------------------------------------------------ docs

/** Bring back an older version; the current text becomes a version itself (database trigger). */
export function restoreVersion(note: Note, version: NoteVersion) {
  updateNote(note.id, { title: version.title, content: version.content });
}

export function linkTask(note: Note, taskId: string, on: boolean) {
  const exists = S().data.note_tasks[`${note.id}|${taskId}`];
  if (on && !exists) {
    mutate([{ table: "note_tasks", kind: "insert", row: { note_id: note.id, task_id: taskId, workspace_id: note.workspace_id, created_at: nowIso() } }]);
  } else if (!on && exists) {
    mutate([{ table: "note_tasks", kind: "delete", row: { note_id: note.id, task_id: taskId } }]);
  }
}
