"use client";

// In-browser adapter for demo mode. Writes succeed locally and persist through the store's
// IndexedDB snapshot; nothing leaves the browser.

import { buildDemoData } from "@/lib/demo/seed";
import { todayIn } from "@/lib/dates";
import { activityFor } from "@/lib/activity";
import { indexRows } from "./supabase-adapter";
import { PK, type DataAdapter, type StoreData } from "./tables";

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
