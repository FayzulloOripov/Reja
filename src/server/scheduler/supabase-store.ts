import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EXPORT_TABLES, exportFileName } from "@/lib/export";
import type { PushSub, SchedNotification, SchedProfile, SchedReminder, SchedTask, SchedulerStore } from "./core";

const PROFILE_COLS =
  "id, name, email, language, timezone, quiet_enabled, quiet_start, quiet_end, notify_prefs, telegram_chat_id, digest_enabled, digest_time, review_enabled, review_dow, review_time, overdue_nudge_enabled, last_digest_on, last_review_on, last_overdue_nudge_on, shutdown_enabled, shutdown_time, last_shutdown_on, prayer_enabled, prayer_lat, prayer_lng, prayer_madhab, prayer_minutes, backup_enabled, last_backup_on";

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

type TaskRow = Omit<SchedTask, "project_name"> & { projects: { name: string } | null };

export function supabaseSchedulerStore(sb: SupabaseClient): SchedulerStore {
  const withProjectNames = async (rows: Omit<SchedTask, "project_name">[]): Promise<SchedTask[]> => {
    const ids = [...new Set(rows.map((r) => r.project_id).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    if (ids.length) {
      const projects = check(await sb.from("projects").select("id, name").in("id", ids)) as { id: string; name: string }[];
      for (const p of projects) names.set(p.id, p.name);
    }
    return rows.map((r) => ({ ...r, project_name: r.project_id ? (names.get(r.project_id) ?? null) : null }));
  };

  return {
    async claimReminders() {
      return check(await sb.rpc("claim_due_reminders", { p_limit: 200 })) as SchedReminder[];
    },

    async claimNotifications() {
      const rows = check(await sb.rpc("claim_pending_notifications", { p_limit: 200 })) as (SchedNotification & { actor_id: string | null })[];
      const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
      const names = new Map<string, string>();
      if (actorIds.length) {
        const ps = check(await sb.from("profiles").select("id, name").in("id", actorIds)) as { id: string; name: string }[];
        for (const p of ps) names.set(p.id, p.name);
      }
      return rows.map((r) => ({ ...r, actor_name: r.actor_id ? (names.get(r.actor_id) ?? null) : null }));
    },

    async profiles(ids) {
      if (!ids.length) return new Map();
      const rows = check(await sb.from("profiles").select(PROFILE_COLS).in("id", ids)) as SchedProfile[];
      return new Map(rows.map((r) => [r.id, r]));
    },

    async tasks(ids) {
      if (!ids.length) return new Map();
      const rows = check(await sb.from("tasks").select("id, title, project_id, due_date, due_at, top_date, status, deleted_at, projects(name)").in("id", ids)) as unknown as TaskRow[];
      return new Map(rows.map((r) => [r.id, { ...r, project_name: r.projects?.name ?? null }]));
    },

    async updateReminder(id, patch) {
      check(await sb.from("reminders").update(patch).eq("id", id));
    },

    async updateNotification(id, patch) {
      check(await sb.from("notifications").update(patch).eq("id", id));
    },

    async recordReminderNotification(r, title, url) {
      check(
        await sb.from("notifications").insert({
          user_id: r.user_id,
          type: "reminder",
          task_id: r.task_id,
          title,
          url,
          delivery: "done",
        }),
      );
    },

    async dailyCandidates() {
      return check(
        await sb
          .from("profiles")
          .select(PROFILE_COLS)
          .or("digest_enabled.eq.true,review_enabled.eq.true,overdue_nudge_enabled.eq.true,shutdown_enabled.eq.true,backup_enabled.eq.true")
          .or("telegram_chat_id.not.is.null,email.not.is.null"),
      ) as SchedProfile[];
    },

    async claimDaily(userId, kind, date) {
      return Boolean(check(await sb.rpc("claim_daily_slot", { p_user: userId, p_kind: kind, p_date: date })));
    },

    async responsibleTasks(userId, until) {
      const rows = check(await sb.rpc("responsible_open_tasks", { p_user: userId, p_until: until })) as Omit<SchedTask, "project_name">[];
      return withProjectNames(rows);
    },

    async backupFor(userId) {
      const owned = check(await sb.from("workspaces").select("id, name").eq("owner_id", userId).is("deleted_at", null)) as { id: string; name: string }[];
      const files: { filename: string; content: string; workspace: string }[] = [];
      for (const ws of owned) {
        const data: Record<string, unknown> = { exported_at: new Date().toISOString(), workspace: ws };
        let rows = 0;
        for (const table of EXPORT_TABLES) {
          const list: unknown[] = [];
          for (let from = 0; ; from += 1000) {
            const page = check(await sb.from(table).select("*").eq("workspace_id", ws.id).range(from, from + 999)) as unknown[];
            list.push(...page);
            if (page.length < 1000) break;
          }
          data[table] = list;
          rows += list.length;
        }
        if (rows === 0) continue; // nothing worth backing up
        files.push({ filename: exportFileName(ws.name, "json"), content: JSON.stringify(data), workspace: ws.name });
      }
      return files;
    },

    async timeBlocks(userId, date) {
      const rows = check(await sb.from("time_blocks").select("title, start_at, end_at, task_id, tasks(title)").eq("user_id", userId).eq("date", date).order("start_at")) as unknown as {
        title: string | null;
        start_at: string;
        end_at: string;
        tasks: { title: string } | null;
      }[];
      return rows.map((b) => ({ title: b.title ?? b.tasks?.title ?? "", start_at: b.start_at, end_at: b.end_at }));
    },

    async completedCount(userId, from, to) {
      return Number(check(await sb.rpc("completed_count", { p_user: userId, p_from: from, p_to: to })));
    },

    async pushSubscriptions(userId) {
      return check(await sb.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId)) as PushSub[];
    },

    async removePushSubscription(id) {
      await sb.from("push_subscriptions").delete().eq("id", id);
    },

    async groupEvents() {
      const projects = check(await sb.from("projects").select("id, name, telegram_chat_id").not("telegram_chat_id", "is", null).is("deleted_at", null)) as { id: string; name: string; telegram_chat_id: number }[];
      if (!projects.length) return [];
      const since = new Date(Date.now() - 60 * 60_000).toISOString();
      const events = check(
        await sb
          .from("activity_log")
          .select("id, project_id, actor_id, action, diff, entity_type")
          .in("project_id", projects.map((p) => p.id))
          .eq("group_posted", false)
          .gte("created_at", since)
          .in("action", ["created", "completed", "assigned", "commented"])
          .order("created_at")
          .limit(50),
      ) as { id: string; project_id: string; actor_id: string | null; action: string; diff: Record<string, unknown>; entity_type: string }[];
      const actorIds = [...new Set(events.map((e) => e.actor_id).filter(Boolean))] as string[];
      const names = new Map<string, string>();
      if (actorIds.length) {
        const ps = check(await sb.from("profiles").select("id, name").in("id", actorIds)) as { id: string; name: string }[];
        for (const p of ps) names.set(p.id, p.name);
      }
      const icon: Record<string, string> = { created: "🆕", completed: "✅", assigned: "👤", commented: "💬" };
      return events.map((e) => {
        const project = projects.find((p) => p.id === e.project_id)!;
        const title = String(e.diff._title ?? e.diff.title ?? "");
        const actor = e.actor_id ? (names.get(e.actor_id) ?? "") : "Telegram";
        const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return { id: e.id, chat_id: project.telegram_chat_id, text: `${icon[e.action] ?? "•"} <b>${esc(actor)}</b> · ${esc(title)}\n<i>${esc(project.name)}</i>` };
      });
    },

    async markGroupPosted(ids) {
      if (ids.length) await sb.from("activity_log").update({ group_posted: true }).in("id", ids);
    },
  };
}
