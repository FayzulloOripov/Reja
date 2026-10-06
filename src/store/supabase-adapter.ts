"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { ActivityEntry } from "@/lib/types";
import {
  AdapterError,
  PK,
  type ChangeEvent,
  type DataAdapter,
  type Op,
  type StoreData,
  type TableName,
} from "./tables";

const PAGE = 1000;

function isNetworkError(message: string): boolean {
  return (
    (typeof navigator !== "undefined" && !navigator.onLine) ||
    /failed to fetch|fetch failed|networkerror|load failed|network request failed|timeout/i.test(message)
  );
}

type Query = ReturnType<ReturnType<SupabaseClient["from"]>["select"]>;

async function fetchAllPages<T>(build: () => Query): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new AdapterError(error.message, isNetworkError(error.message), error.code);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Loaders for tables added after the first release (kept separate so the list above stays readable). */
function EXTRA_LOADERS(sb: SupabaseClient, userId: string): Partial<Record<TableName, () => Query>> {
  void userId;
  void sb;
  return {};
}

// Tables kept in sync per workspace (all carry workspace_id).
const WORKSPACE_TABLES: TableName[] = [
  "areas",
  "projects",
  "project_members",
  "sections",
  "tasks",
  "task_assignees",
  "task_watchers",
  "task_dependencies",
  "labels",
  "task_labels",
  "checklist_items",
  "comments",
  "comment_reactions",
  "attachments",
  "goals",
  "key_results",
  "notes",
  "time_entries",
];

// Tables scoped to the signed-in user.
const USER_TABLES: TableName[] = ["notifications", "reminders", "habits", "habit_logs", "time_blocks", "project_favorites"];

export function createSupabaseAdapter(): DataAdapter {
  const sb = getBrowserSupabase();

  return {
    kind: "supabase",

    async loadAll(userId) {
      const since120 = new Date(Date.now() - 120 * 86_400_000).toISOString();
      const since400 = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
      const since60 = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
      const all = (t: string) => () => sb.from(t).select("*");
      const live = (t: string) => () => sb.from(t).select("*").is("deleted_at", null);
      const own = (t: string) => () => sb.from(t).select("*").eq("user_id", userId);

      // what the client keeps in memory; RLS decides which rows each user receives
      const loaders: Partial<Record<TableName, () => Query>> = {
        profiles: all("profiles"),
        workspaces: live("workspaces"),
        workspace_members: all("workspace_members"),
        areas: live("areas"),
        projects: live("projects"),
        project_members: all("project_members"),
        project_favorites: own("project_favorites"),
        sections: live("sections"),
        // open tasks plus everything completed recently (reports look back 16 weeks)
        tasks: () =>
          sb
            .from("tasks")
            .select("*")
            .is("deleted_at", null)
            .or(`status.in.(todo,in_progress,waiting),completed_at.gte.${since120},updated_at.gte.${since120}`),
        task_assignees: all("task_assignees"),
        task_watchers: all("task_watchers"),
        task_dependencies: all("task_dependencies"),
        labels: live("labels"),
        task_labels: all("task_labels"),
        checklist_items: all("checklist_items"),
        reminders: () => sb.from("reminders").select("*").eq("user_id", userId).in("status", ["pending", "snoozed", "sending", "sent"]),
        notifications: () => sb.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(200),
        goals: live("goals"),
        key_results: all("key_results"),
        key_result_history: all("key_result_history"),
        notes: live("notes"),
        habits: own("habits"),
        habit_logs: () => sb.from("habit_logs").select("*").eq("user_id", userId).gte("date", since400),
        time_blocks: () => sb.from("time_blocks").select("*").eq("user_id", userId).gte("date", since60),
        time_entries: () => sb.from("time_entries").select("*").gte("started_at", since120),
        saved_views: all("saved_views"),
        templates: all("templates"),
        invitations: () => sb.from("invitations").select("*").is("revoked_at", null),
        ...EXTRA_LOADERS(sb, userId),
      };
      const entries = Object.entries(loaders) as [TableName, () => Query][];
      const results = await Promise.all(entries.map(([, build]) => fetchAllPages<Record<string, unknown>>(build)));
      return indexRows(Object.fromEntries(entries.map(([table], i) => [table, results[i]])));
    },

    async exec(op: Op) {
      const table = sb.from(op.table);
      let error: { message: string; code?: string } | null = null;
      if (op.kind === "insert") {
        const res = await table.upsert(op.values!, { onConflict: PK[op.table].join(","), ignoreDuplicates: true });
        error = res.error;
      } else if (op.kind === "update") {
        const res = await table.update(op.values!).match(op.key).select(PK[op.table].join(","));
        error = res.error;
        if (!error && (res.data?.length ?? 0) === 0) {
          throw new AdapterError("permission", false, "42501");
        }
      } else if (op.kind === "delete") {
        const res = await table.delete().match(op.key);
        error = res.error;
      } else {
        // never let a malformed operation fall through to a delete
        throw new AdapterError(`unknown operation "${String(op.kind)}" on ${op.table}`, false, "22023");
      }
      if (error) throw new AdapterError(error.message, isNetworkError(error.message), error.code);
    },

    subscribe(userId, workspaceIds, onChange) {
      const channels: RealtimeChannel[] = [];
      const forward =
        (table: TableName) =>
        (payload: { eventType: "INSERT" | "UPDATE" | "DELETE"; new: Record<string, unknown>; old: Record<string, unknown> }) => {
          const ev: ChangeEvent = {
            table,
            type: payload.eventType,
            row: payload.eventType === "DELETE" ? undefined : payload.new,
            old: payload.old,
          };
          onChange(ev);
        };

      for (const ws of workspaceIds) {
        let ch = sb.channel(`ws:${ws}`);
        for (const t of WORKSPACE_TABLES) {
          ch = ch.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `workspace_id=eq.${ws}` }, forward(t));
        }
        ch = ch.on("postgres_changes", { event: "*", schema: "public", table: "workspace_members", filter: `workspace_id=eq.${ws}` }, forward("workspace_members"));
        ch = ch.on("postgres_changes", { event: "*", schema: "public", table: "workspaces", filter: `id=eq.${ws}` }, forward("workspaces"));
        channels.push(ch.subscribe());
      }

      let mine = sb.channel(`user:${userId}`);
      for (const t of USER_TABLES) {
        mine = mine.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `user_id=eq.${userId}` }, forward(t));
      }
      mine = mine
        .on("postgres_changes", { event: "*", schema: "public", table: "workspace_members", filter: `user_id=eq.${userId}` }, forward("workspace_members"))
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` }, forward("profiles"));
      channels.push(mine.subscribe());

      return () => {
        for (const ch of channels) void sb.removeChannel(ch);
      };
    },

    async loadTaskDetail(taskId) {
      const [comments, attachments] = await Promise.all([
        fetchAllPages(() => sb.from("comments").select("*").eq("task_id", taskId).is("deleted_at", null)),
        fetchAllPages(() => sb.from("attachments").select("*").eq("task_id", taskId).is("deleted_at", null)),
      ]);
      const commentIds = (comments as { id: string }[]).map((c) => c.id);
      const reactions = commentIds.length
        ? await fetchAllPages(() => sb.from("comment_reactions").select("*").in("comment_id", commentIds))
        : [];
      return indexRows({ comments, attachments, comment_reactions: reactions } as Record<string, Record<string, unknown>[]>);
    },

    async loadActivity(scope, limit = 50) {
      let q = sb.from("activity_log").select("*").order("created_at", { ascending: false }).limit(limit);
      if (scope.taskId) q = q.eq("task_id", scope.taskId);
      else if (scope.projectId) q = q.eq("project_id", scope.projectId);
      else if (scope.workspaceId) q = q.eq("workspace_id", scope.workspaceId);
      const { data, error } = await q;
      if (error) throw new AdapterError(error.message, isNetworkError(error.message));
      return (data ?? []) as ActivityEntry[];
    },

    async loadTrash(workspaceIds) {
      if (workspaceIds.length === 0) return {};
      const [tasks, projects, notes] = await Promise.all([
        fetchAllPages(() => sb.from("tasks").select("*").in("workspace_id", workspaceIds).not("deleted_at", "is", null)),
        fetchAllPages(() => sb.from("projects").select("*").in("workspace_id", workspaceIds).not("deleted_at", "is", null)),
        fetchAllPages(() => sb.from("notes").select("*").in("workspace_id", workspaceIds).not("deleted_at", "is", null)),
      ]);
      return indexRows({ tasks, projects, notes } as Record<string, Record<string, unknown>[]>);
    },

    async rpc<T>(fn: string, args?: Record<string, unknown>) {
      const { data, error } = await sb.rpc(fn, args);
      if (error) throw new AdapterError(error.message, isNetworkError(error.message), error.code);
      return data as T;
    },

    async upload(path, file) {
      const { error } = await sb.storage.from("attachments").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw new AdapterError(error.message, isNetworkError(error.message));
    },

    async fileUrl(path) {
      const { data } = await sb.storage.from("attachments").createSignedUrl(path, 3600);
      return data?.signedUrl ?? null;
    },

    async removeFile(path) {
      await sb.storage.from("attachments").remove([path]);
    },
  };
}

function indexRows(rows: Record<string, Record<string, unknown>[]>): Partial<StoreData> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [table, list] of Object.entries(rows)) {
    const pk = PK[table as TableName];
    const map: Record<string, unknown> = {};
    for (const r of list) map[pk.map((c) => String(r[c])).join("|")] = r;
    out[table] = map;
  }
  return out as Partial<StoreData>;
}

export { indexRows };
