// The scheduler runs every minute (pg_cron → /api/cron/reminders). It is idempotent: every unit
// of work is claimed atomically in Postgres first, so overlapping runs never send twice.
//
//   1. due reminders     → in-app + Telegram (with buttons) + Web Push + email, honouring quiet hours
//   2. pending notifications (assigned, mentioned, comments, …) → channels per user preferences
//   3. daily digest, weekly review and overdue nudge at each user's local time
//   4. Telegram group posts for projects connected to a group

import { addDays, startOfWeek, timeIn, zonedToUtc } from "@/lib/dates";
import { deliveryTime, dueDailySlots, inQuietHours, type DailySlotKind, type DailySlotProfile } from "@/lib/reminders";
import type { Channel, NotificationType, NotifyPrefs } from "@/lib/types";

export interface SchedProfile extends DailySlotProfile {
  id: string;
  name: string;
  email: string | null;
  language: string;
  quiet_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  notify_prefs: NotifyPrefs;
  telegram_chat_id: number | null;
}

export interface SchedTask {
  id: string;
  title: string;
  project_id: string | null;
  project_name?: string | null;
  due_date: string | null;
  due_at: string | null;
  top_date: string | null;
  status: string;
  deleted_at: string | null;
}

export interface SchedReminder {
  id: string;
  user_id: string;
  task_id: string | null;
  title: string | null;
  remind_at: string;
  channels: Channel[];
  attempts: number;
}

export interface SchedNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  url: string | null;
  actor_name: string | null;
}

export interface PushSub {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface SchedulerStore {
  claimReminders(): Promise<SchedReminder[]>;
  claimNotifications(): Promise<SchedNotification[]>;
  profiles(ids: string[]): Promise<Map<string, SchedProfile>>;
  tasks(ids: string[]): Promise<Map<string, SchedTask>>;
  updateReminder(id: string, patch: Record<string, unknown>): Promise<void>;
  updateNotification(id: string, patch: Record<string, unknown>): Promise<void>;
  recordReminderNotification(r: SchedReminder, title: string, url: string): Promise<void>;
  dailyCandidates(): Promise<SchedProfile[]>;
  claimDaily(userId: string, kind: DailySlotKind, date: string): Promise<boolean>;
  responsibleTasks(userId: string, until: string): Promise<SchedTask[]>;
  timeBlocks(userId: string, date: string): Promise<{ title: string; start_at: string; end_at: string }[]>;
  completedCount(userId: string, from: string, to: string): Promise<number>;
  pushSubscriptions(userId: string): Promise<PushSub[]>;
  removePushSubscription(id: string): Promise<void>;
  groupEvents(): Promise<{ id: string; chat_id: number; text: string }[]>;
  markGroupPosted(ids: string[]): Promise<void>;
}

export interface Button {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface EmailContent {
  heading: string;
  intro?: string;
  sections: { title: string; items: string[] }[];
  button: string;
  url: string;
}

export interface Senders {
  telegram(chatId: number, html: string, buttons?: Button[][]): Promise<void>;
  push(sub: PushSub, payload: { title: string; body?: string; url?: string; tag?: string }): Promise<"ok" | "gone" | "error">;
  email(to: string, subject: string, content: EmailContent, lang: string): Promise<boolean>;
}

export type Translate = (locale: string) => (key: string, values?: Record<string, string | number>) => string;

export interface RunResult {
  reminders: { claimed: number; sent: number; deferred: number; dismissed: number; failed: number };
  notifications: { claimed: number; delivered: number; deferred: number };
  daily: { digest: number; review: number; overdue: number; shutdown: number };
  groupPosts: number;
  errors: string[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pref = (p: SchedProfile, ch: Channel, ev: string) => Boolean(p.notify_prefs?.[ch]?.[ev as NotificationType]);
const quiet = (p: SchedProfile) => ({ enabled: p.quiet_enabled, start: p.quiet_start, end: p.quiet_end });

async function pushAll(store: SchedulerStore, senders: Senders, userId: string, payload: { title: string; body?: string; url?: string; tag?: string }) {
  let ok = false;
  for (const sub of await store.pushSubscriptions(userId)) {
    const res = await senders.push(sub, payload);
    if (res === "ok") ok = true;
    if (res === "gone") await store.removePushSubscription(sub.id);
  }
  return ok;
}

export async function runScheduler(opts: { store: SchedulerStore; senders: Senders; now: Date; t: Translate; siteUrl: string }): Promise<RunResult> {
  const { store, senders, now, t, siteUrl } = opts;
  const result: RunResult = {
    reminders: { claimed: 0, sent: 0, deferred: 0, dismissed: 0, failed: 0 },
    notifications: { claimed: 0, delivered: 0, deferred: 0 },
    daily: { digest: 0, review: 0, overdue: 0, shutdown: 0 },
    groupPosts: 0,
    errors: [],
  };

  // ---------------------------------------------------------------- 1. reminders
  const reminders = await store.claimReminders();
  result.reminders.claimed = reminders.length;
  if (reminders.length) {
    const profiles = await store.profiles([...new Set(reminders.map((r) => r.user_id))]);
    const tasks = await store.tasks(reminders.map((r) => r.task_id).filter((x): x is string => Boolean(x)));
    for (const r of reminders) {
      const p = profiles.get(r.user_id);
      const task = r.task_id ? tasks.get(r.task_id) : undefined;
      if (!p || (r.task_id && (!task || task.deleted_at || task.status === "done" || task.status === "cancelled"))) {
        await store.updateReminder(r.id, { status: "dismissed", claimed_at: null });
        result.reminders.dismissed++;
        continue;
      }
      const when = deliveryTime(now, p.timezone, quiet(p));
      if (when.getTime() > now.getTime()) {
        await store.updateReminder(r.id, { status: "pending", remind_at: when.toISOString(), claimed_at: null, attempts: Math.max(0, r.attempts - 1) });
        result.reminders.deferred++;
        continue;
      }
      const tr = t(p.language);
      const title = r.title ?? task?.title ?? tr("bot.reminder");
      const url = task ? `${siteUrl}/tasks/${task.id}` : siteUrl;
      const timeLabel = task?.due_at ? ` · ${timeIn(p.timezone, task.due_at)}` : "";
      const line = `${tr("bot.reminder")}\n<b>${esc(title)}</b>${task?.project_name ? `\n<i>${esc(task.project_name)}</i>` : ""}${esc(timeLabel)}`;
      let delivered = false;
      let lastError = "";
      try {
        if (r.channels.includes("in_app") && pref(p, "in_app", "reminder")) {
          await store.recordReminderNotification(r, title, task ? `/tasks/${task.id}` : "/notifications");
          delivered = true;
        }
        if (r.channels.includes("telegram") && p.telegram_chat_id && pref(p, "telegram", "reminder")) {
          const buttons: Button[][] = [
            [
              { text: tr("bot.btnDone"), callback_data: `d:${r.id}` },
              { text: tr("bot.btnSnooze"), callback_data: `s:${r.id}` },
            ],
            [{ text: tr("bot.btnTomorrow"), callback_data: `t:${r.id}` }, { text: tr("bot.btnOpen"), url }],
          ];
          await senders.telegram(p.telegram_chat_id, line, buttons);
          delivered = true;
        }
        if (r.channels.includes("push") && pref(p, "push", "reminder")) {
          if (await pushAll(store, senders, p.id, { title: `⏰ ${title}`, body: task?.project_name ?? undefined, url: task ? `/tasks/${task.id}` : "/", tag: `reminder-${r.id}` })) delivered = true;
        }
        if (p.email && pref(p, "email", "reminder")) {
          if (await senders.email(p.email, tr("email.reminderSubject", { title }), { heading: title, sections: [], button: tr("bot.btnOpen"), url }, p.language)) delivered = true;
        }
      } catch (e) {
        lastError = (e as Error).message;
        result.errors.push(`reminder ${r.id}: ${lastError}`);
      }
      if (delivered || !lastError) {
        await store.updateReminder(r.id, { status: "sent", sent_at: now.toISOString(), claimed_at: null, last_error: lastError || null });
        result.reminders.sent++;
      } else if (r.attempts < 3) {
        await store.updateReminder(r.id, { status: "pending", remind_at: new Date(now.getTime() + 5 * 60_000).toISOString(), claimed_at: null, last_error: lastError });
        result.reminders.deferred++;
      } else {
        await store.updateReminder(r.id, { status: "failed", claimed_at: null, last_error: lastError });
        result.reminders.failed++;
      }
    }
  }

  // ---------------------------------------------------------------- 2. notifications
  const notifications = await store.claimNotifications();
  result.notifications.claimed = notifications.length;
  if (notifications.length) {
    const profiles = await store.profiles([...new Set(notifications.map((n) => n.user_id))]);
    for (const n of notifications) {
      const p = profiles.get(n.user_id);
      if (!p || n.type === "reminder") {
        await store.updateNotification(n.id, { delivery: "done" });
        continue;
      }
      if (inQuietHours(now, p.timezone, quiet(p))) {
        await store.updateNotification(n.id, { delivery: "pending", deliver_after: deliveryTime(now, p.timezone, quiet(p)).toISOString() });
        result.notifications.deferred++;
        continue;
      }
      const tr = t(p.language);
      const what = n.actor_name ? `${n.actor_name} ${tr(`notifications.type.${n.type}`)}` : tr(`notifications.type.${n.type}`);
      const status = n.type === "status_change" && n.body ? ` → ${tr(`status.${n.body}`)}` : "";
      const body = n.type !== "status_change" && n.body ? `\n${n.body}` : "";
      const url = `${siteUrl}${n.url ?? "/notifications"}`;
      try {
        if (p.telegram_chat_id && pref(p, "telegram", n.type)) {
          await senders.telegram(p.telegram_chat_id, `${esc(what)}${esc(status)}\n<b>${esc(n.title)}</b>${esc(body)}`, [[{ text: tr("bot.btnOpen"), url }]]);
        }
        if (pref(p, "push", n.type)) {
          await pushAll(store, senders, p.id, { title: n.title, body: `${what}${status}${body}`.trim(), url: n.url ?? "/notifications", tag: n.id });
        }
        if (p.email && pref(p, "email", n.type)) {
          await senders.email(p.email, tr("email.notificationSubject", { title: n.title }), { heading: n.title, intro: `${what}${status}${body}`, sections: [], button: tr("bot.btnOpen"), url }, p.language);
        }
        result.notifications.delivered++;
      } catch (e) {
        result.errors.push(`notification ${n.id}: ${(e as Error).message}`);
      }
      await store.updateNotification(n.id, { delivery: "done" });
    }
  }

  // ---------------------------------------------------------------- 3. digest, review, overdue nudge
  for (const p of await store.dailyCandidates()) {
    for (const slot of dueDailySlots(p, now)) {
      if (!(await store.claimDaily(p.id, slot.kind, slot.date))) continue;
      try {
        const sent = await sendDaily(store, senders, t, siteUrl, p, slot.kind, slot.date);
        if (sent) result.daily[slot.kind]++;
      } catch (e) {
        result.errors.push(`${slot.kind} ${p.id}: ${(e as Error).message}`);
      }
    }
  }

  // ---------------------------------------------------------------- 4. Telegram groups
  try {
    const events = await store.groupEvents();
    const posted: string[] = [];
    for (const ev of events) {
      try {
        await senders.telegram(ev.chat_id, ev.text);
        posted.push(ev.id);
      } catch (e) {
        result.errors.push(`group ${ev.id}: ${(e as Error).message}`);
        posted.push(ev.id); // never retry-spam a group
      }
    }
    if (posted.length) await store.markGroupPosted(posted);
    result.groupPosts = posted.length;
  } catch (e) {
    result.errors.push(`groups: ${(e as Error).message}`);
  }

  return result;
}

function formatDay(iso: string, locale: string) {
  const months = locale === "en"
    ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    : ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];
  const m = months[Number(iso.slice(5, 7)) - 1];
  return locale === "en" ? `${m} ${Number(iso.slice(8))}` : `${Number(iso.slice(8))}-${m}`;
}

export interface DigestData {
  top: SchedTask[];
  today: SchedTask[];
  overdue: SchedTask[];
  blocks: { title: string; start: string; end: string }[];
}

export async function collectDigest(store: SchedulerStore, p: SchedProfile, date: string): Promise<DigestData> {
  const tasks = await store.responsibleTasks(p.id, date);
  const top = tasks.filter((x) => x.top_date === date);
  const topIds = new Set(top.map((x) => x.id));
  const today = tasks.filter((x) => x.due_date === date && !topIds.has(x.id));
  const overdue = tasks.filter((x) => x.due_date && x.due_date < date && !topIds.has(x.id));
  const blocks = (await store.timeBlocks(p.id, date)).map((b) => ({ title: b.title, start: timeIn(p.timezone, b.start_at), end: timeIn(p.timezone, b.end_at) }));
  return { top, today, overdue, blocks };
}

async function sendDaily(store: SchedulerStore, senders: Senders, t: Translate, siteUrl: string, p: SchedProfile, kind: DailySlotKind, date: string): Promise<boolean> {
  const tr = t(p.language);
  if (kind === "shutdown") {
    // a gentle push only: what is still open today, and a link to close the day
    const open = await store.responsibleTasks(p.id, date);
    const left = open.filter((x) => (x.due_date && x.due_date <= date) || x.top_date === date).length;
    return pushAll(store, senders, p.id, {
      title: tr("push.shutdownTitle"),
      body: left ? tr("push.shutdownBody", { count: left }) : tr("push.shutdownBodyClear"),
      url: "/shutdown",
      tag: "reja-shutdown",
    });
  }
  const first = (p.name || "").split(" ")[0] || "👋";
  const item = (x: SchedTask) => `${x.due_at ? `${timeIn(p.timezone, x.due_at)} ` : ""}${x.title}${x.project_name ? ` — ${x.project_name}` : ""}`;
  const MAX = 8;
  const list = (rows: string[]) => {
    const shown = rows.slice(0, MAX).map((r) => `• ${esc(r)}`);
    if (rows.length > MAX) shown.push(esc(tr("bot.more", { count: rows.length - MAX })));
    return shown.join("\n");
  };

  let html = "";
  let email: EmailContent | null = null;
  let channelKey: "digest" | "review" | "overdue" = kind;
  // short push version of the same summary
  let push: { title: string; body: string } | null = null;

  if (kind === "digest") {
    const d = await collectDigest(store, p, date);
    const sections = [
      { title: tr("bot.top3"), items: d.top.map(item) },
      { title: tr("bot.today"), items: d.today.map(item) },
      { title: `${tr("bot.overdue")} (${d.overdue.length})`, items: d.overdue.map((x) => `${x.title} (${formatDay(x.due_date!, p.language)})`) },
      { title: tr("bot.blocks"), items: d.blocks.map((b) => `${b.start}–${b.end} ${b.title}`) },
    ].filter((s) => s.items.length);
    html = `<b>${esc(tr("bot.digestTitle", { name: first }))}</b>\n\n${sections.length ? sections.map((s) => `<b>${esc(s.title)}</b>\n${list(s.items)}`).join("\n\n") : esc(tr("bot.empty"))}`;
    email = { heading: tr("email.digestHeading", { name: first }), sections, button: tr("email.openApp"), url: siteUrl };
    push = {
      title: tr("bot.digestTitle", { name: first }),
      body: d.top.length + d.today.length + d.overdue.length
        ? tr("push.digestBody", { top: d.top.length, today: d.today.length, overdue: d.overdue.length })
        : tr("bot.empty"),
    };
  } else if (kind === "review") {
    const weekStart = startOfWeek(date);
    const lastWeekStart = addDays(weekStart, -7);
    const from = zonedToUtc(lastWeekStart, "00:00", p.timezone).toISOString();
    const to = zonedToUtc(weekStart, "00:00", p.timezone).toISOString();
    const done = await store.completedCount(p.id, from, to);
    const open = await store.responsibleTasks(p.id, addDays(date, 7));
    const slipped = open.filter((x) => x.due_date && x.due_date < date);
    const upcoming = open.filter((x) => x.due_date && x.due_date >= date).slice(0, 10);
    html = `<b>${esc(tr("bot.reviewTitle"))}</b>\n\n✅ ${esc(tr("bot.reviewDone", { count: done }))}\n⚠️ ${esc(tr("bot.reviewSlipped", { count: slipped.length }))}${slipped.length ? `\n${list(slipped.map((x) => x.title))}` : ""}\n\n${esc(tr("bot.reviewPlan"))}${upcoming.length ? `\n${list(upcoming.map(item))}` : ""}`;
    email = {
      heading: tr("email.reviewHeading", { name: first }),
      intro: `${tr("bot.reviewDone", { count: done })} · ${tr("bot.reviewSlipped", { count: slipped.length })}`,
      sections: [{ title: tr("bot.overdue"), items: slipped.map((x) => x.title) }, { title: tr("bot.week"), items: upcoming.map(item) }],
      button: tr("email.openApp"),
      url: siteUrl,
    };
    push = { title: tr("bot.reviewTitle"), body: `${tr("bot.reviewDone", { count: done })} · ${tr("bot.reviewSlipped", { count: slipped.length })}` };
  } else {
    const open = await store.responsibleTasks(p.id, date);
    const overdue = open.filter((x) => x.due_date && x.due_date < date);
    if (overdue.length === 0) return false;
    html = `${esc(tr("bot.overdueNudge", { count: overdue.length }))}\n${list(overdue.map((x) => `${x.title} (${formatDay(x.due_date!, p.language)})`))}`;
    channelKey = "overdue";
    push = { title: tr("push.overdueTitle", { count: overdue.length }), body: overdue.slice(0, 3).map((x) => x.title).join(" · ") };
  }

  let sent = false;
  const button = [[{ text: tr("bot.btnOpen"), url: siteUrl }]];
  if (p.telegram_chat_id && pref(p, "telegram", channelKey)) {
    await senders.telegram(p.telegram_chat_id, html, button);
    sent = true;
  }
  if (push && pref(p, "push", channelKey)) {
    if (await pushAll(store, senders, p.id, { ...push, url: siteUrl, tag: `reja-${kind}` })) sent = true;
  }
  if (email && p.email && pref(p, "email", channelKey)) {
    const subject = kind === "digest" ? tr("email.digestSubject", { date: formatDay(date, p.language) }) : tr("email.reviewSubject");
    if (await senders.email(p.email, subject, email, p.language)) sent = true;
  }
  return sent;
}
