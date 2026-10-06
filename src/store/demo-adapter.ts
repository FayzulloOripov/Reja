"use client";

// In-browser adapter for demo mode. Writes succeed locally and persist through the store's
// IndexedDB snapshot; nothing leaves the browser.

import { buildDemoData } from "@/lib/demo/seed";
import { todayIn } from "@/lib/dates";
import { activityFor } from "@/lib/activity";
import { DEMO_EDITED } from "@/lib/demo/import";
import { indexRows } from "./index-rows";
import { PK, type DataAdapter, type StoreData } from "./tables";

/** Rows the database triggers would write for this change (deal stage history, document versions). */
function demoTriggerRows(
  op: Parameters<DataAdapter["exec"]>[0],
  next: Record<string, unknown> | null,
  userId: string,
  versions: StoreData["note_versions"],
): { table: "deal_stage_history" | "note_versions"; row: Record<string, unknown> } | null {
  const prev = op.prev ?? null;
  const now = new Date().toISOString();
  if (op.table === "deals" && next && (op.kind === "insert" || (op.kind === "update" && prev?.stage_id !== next.stage_id))) {
    return {
      table: "deal_stage_history",
      row: { id: crypto.randomUUID(), deal_id: next.id, workspace_id: next.workspace_id, from_stage_id: op.kind === "update" ? (prev?.stage_id ?? null) : null, to_stage_id: next.stage_id, changed_by: userId, changed_at: now },
    };
  }
  if (op.table === "notes" && op.kind === "update" && prev && next && (JSON.stringify(prev.content) !== JSON.stringify(next.content) || prev.title !== next.title)) {
    const last = Object.values(versions)
      .filter((v) => v.note_id === prev.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (last && last.created_by === userId && Date.now() - Date.parse(last.created_at) < 10 * 60_000) return null;
    return {
      table: "note_versions",
      row: { id: crypto.randomUUID(), note_id: prev.id, workspace_id: prev.workspace_id, project_id: prev.project_id, title: prev.title, content: prev.content, created_by: userId, created_at: now },
    };
  }
  return null;
}

export function createDemoAdapter(lang: "uz" | "en"): DataAdapter {
  const files = new Map<string, string>();
  let seeded: Partial<StoreData> | null = null;

  return {
    kind: "demo",

    async loadAll(userId) {
      // The snapshot (if any) already holds the user's edits; only seed a brand-new browser.
      const { useStore } = await import("./store");
      const current = useStore.getState().data;
      if (Object.keys(current.tasks).length > 0) return current;
      if (!seeded) {
        const today = todayIn("Asia/Tashkent");
        seeded = indexRows(buildDemoData(userId, today, "Asia/Tashkent", lang) as unknown as Record<string, Record<string, unknown>[]>);
      }
      return seeded;
    },

    async exec(op) {
      // nothing to send: the change is already in the store and the snapshot. Like the database
      // triggers, record what happened in the activity log.
      const { useStore } = await import("./store");
      const st = useStore.getState();
      const key = PK[op.table].map((c) => op.key[c]).join("|");
      const next = (st.data[op.table] as unknown as Record<string, Record<string, unknown>>)[key] ?? null;
      const entries = activityFor(
        { table: op.table, kind: op.kind, prev: op.prev ?? null, next: op.kind === "delete" ? null : next },
        { actorId: st.userId ?? "", now: new Date().toISOString(), newId: () => crypto.randomUUID(), taskById: (id) => st.data.tasks[id] as unknown as Record<string, unknown> },
      );
      if (entries.length) {
        useStore.setState((s) => ({ data: { ...s.data, activity_log: { ...s.data.activity_log, ...Object.fromEntries(entries.map((e) => [e.id, e])) } } }));
      }
      // remember which sample rows the visitor changed, so "only what I entered" brings them along
      if (op.kind === "update" && next && !next[DEMO_EDITED]) {
        useStore.setState((s) => {
          const table = s.data[op.table] as unknown as Record<string, Record<string, unknown>>;
          return table[key] ? { data: { ...s.data, [op.table]: { ...table, [key]: { ...table[key], [DEMO_EDITED]: true } } } } : {};
        });
      }
      // what the database triggers add: deal stage history and document versions
      const extra = demoTriggerRows(op, next, st.userId ?? "", st.data.note_versions);
      if (extra) {
        useStore.setState((s) => ({ data: { ...s.data, [extra.table]: { ...(s.data[extra.table] as Record<string, unknown>), [extra.row.id as string]: extra.row } } }));
      }
    },

    subscribe() {
      return () => {};
    },

    async loadTaskDetail() {
      return {};
    },

    async loadActivity(scope, limit = 50) {
      const { useStore } = await import("./store");
      return Object.values(useStore.getState().data.activity_log)
        .filter((e) => (scope.taskId ? e.task_id === scope.taskId : scope.projectId ? e.project_id === scope.projectId : scope.workspaceId ? e.workspace_id === scope.workspaceId : true))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit);
    },

    async loadTrash() {
      return {};
    },

    async rpc<T>(fn: string) {
      if (fn === "create_telegram_link_code") return "DEMO1234" as T;
      if (fn === "regenerate_ics_token") return "demo-token" as T;
      return null as T;
    },

    async upload(path, file) {
      files.set(path, URL.createObjectURL(file));
    },

    async fileUrl(path) {
      return files.get(path) ?? null;
    },

    async removeFile(path) {
      files.delete(path);
    },
  };
}
