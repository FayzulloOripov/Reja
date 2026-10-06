import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it } from "vitest";
import uz from "../../messages/uz.json";
import en from "../../messages/en.json";
import { runScheduler, type SchedNotification, type SchedProfile, type SchedReminder, type SchedTask, type SchedulerStore, type Senders } from "@/server/scheduler/core";

const t = (locale: string) => {
  const tr = createTranslator({ locale: locale === "en" ? "en" : "uz", messages: (locale === "en" ? en : uz) as typeof uz });
  return (key: string, values?: Record<string, string | number>) => tr(key as never, values as never);
};

const profile = (p: Partial<SchedProfile> = {}): SchedProfile => ({
  id: "u1",
  name: "Fayzullo Oripov",
  email: "f@example.test",
  language: "uz",
  timezone: "Asia/Tashkent",
  quiet_enabled: true,
  quiet_start: "22:00:00",
  quiet_end: "07:00:00",
  notify_prefs: {
    in_app: { reminder: true, assigned: true },
    telegram: { reminder: true, assigned: true, digest: true, review: true, overdue: true },
    push: { reminder: true, assigned: false },
    email: { reminder: false, assigned: false, digest: false },
  },
  telegram_chat_id: 777,
  digest_enabled: true,
  digest_time: "07:30:00",
  review_enabled: true,
  review_dow: 7,
  review_time: "09:00:00",
  overdue_nudge_enabled: false,
  last_digest_on: null,
  last_review_on: null,
  last_overdue_nudge_on: null,
  ...p,
});

/** In-memory store that mimics the SQL claim semantics (each due row is returned once). */
class FakeStore implements SchedulerStore {
  reminders: (SchedReminder & { status: string; sent_at?: string | null; last_error?: string | null })[] = [];
  notifications: (SchedNotification & { delivery: string; deliver_after: string })[] = [];
  prof = new Map<string, SchedProfile>();
  taskMap = new Map<string, SchedTask>();
  slots = new Set<string>();
  inApp: string[] = [];
  now = new Date();
  async claimReminders() {
    const due = this.reminders.filter((r) => (r.status === "pending" || r.status === "snoozed") && new Date(r.remind_at) <= this.now);
    for (const r of due) {
      r.status = "sending";
      r.attempts += 1;
    }
    return due.map((r) => ({ ...r }));
  }
  async claimNotifications() {
    const due = this.notifications.filter((n) => n.delivery === "pending" && new Date(n.deliver_after) <= this.now);
    for (const n of due) n.delivery = "sending";
    return due.map((n) => ({ ...n }));
  }
  async profiles(ids: string[]) {
    return new Map(ids.filter((id) => this.prof.has(id)).map((id) => [id, this.prof.get(id)!]));
  }
  async tasks(ids: string[]) {
    return new Map(ids.filter((id) => this.taskMap.has(id)).map((id) => [id, this.taskMap.get(id)!]));
  }
  async updateReminder(id: string, patch: Record<string, unknown>) {
    Object.assign(this.reminders.find((r) => r.id === id)!, patch);
  }
  async updateNotification(id: string, patch: Record<string, unknown>) {
    Object.assign(this.notifications.find((n) => n.id === id)!, patch);
  }
  async recordReminderNotification(r: SchedReminder, title: string) {
    this.inApp.push(title);
  }
  async dailyCandidates() {
    return [...this.prof.values()];
  }
  async claimDaily(userId: string, kind: string, date: string) {
    const key = `${userId}:${kind}:${date}`;
    if (this.slots.has(key)) return false;
    this.slots.add(key);
    return true;
  }
  async responsibleTasks() {
    return [...this.taskMap.values()];
  }
  async timeBlocks() {
    return [{ title: "Agentlik", start_at: "2026-10-05T03:00:00Z", end_at: "2026-10-05T04:00:00Z" }];
  }
  async completedCount() {
    return 7;
  }
  async pushSubscriptions() {
    return [{ id: "s1", endpoint: "https://push.example/1", p256dh: "k", auth: "a" }];
  }
  async removePushSubscription() {}
  async groupEvents() {
    return [];
  }
  async markGroupPosted() {}
}

class FakeSenders implements Senders {
  telegrams: { chatId: number; html: string; buttons?: unknown }[] = [];
  pushes: string[] = [];
  emails: string[] = [];
  failTelegram = false;
  async telegram(chatId: number, html: string, buttons?: unknown) {
    if (this.failTelegram) throw new Error("telegram down");
    this.telegrams.push({ chatId, html, buttons });
  }
  async push(_sub: unknown, payload: { title: string }) {
    this.pushes.push(payload.title);
    return "ok" as const;
  }
  async email(to: string, subject: string) {
    this.emails.push(subject);
    return true;
  }
}

let store: FakeStore;
let senders: FakeSenders;
const site = "https://reja.example";
const run = (now: string) => {
  store.now = new Date(now);
  return runScheduler({ store, senders, now: store.now, t, siteUrl: site });
};

beforeEach(() => {
  store = new FakeStore();
  senders = new FakeSenders();
  store.prof.set("u1", profile({ digest_enabled: false, review_enabled: false }));
  store.taskMap.set("t1", { id: "t1", title: "Hisobotni yuborish", project_id: "p1", project_name: "Topcoach", due_date: "2026-10-05", due_at: "2026-10-05T05:00:00Z", top_date: null, status: "todo", deleted_at: null });
});

describe("reminders", () => {
  it("delivers a due reminder once, even if the job runs twice", async () => {
    store.reminders.push({ id: "r1", user_id: "u1", task_id: "t1", title: null, remind_at: "2026-10-05T05:00:00Z", channels: ["in_app", "telegram", "push"], attempts: 0, status: "pending" });
    const first = await run("2026-10-05T05:00:30Z"); // 10:00 Tashkent
    const second = await run("2026-10-05T05:01:30Z");
    expect(first.reminders.sent).toBe(1);
    expect(second.reminders.claimed).toBe(0);
    expect(senders.telegrams).toHaveLength(1);
    expect(senders.telegrams[0].html).toContain("Hisobotni yuborish");
    expect(senders.telegrams[0].html).toContain("10:00");
    expect(JSON.stringify(senders.telegrams[0].buttons)).toContain("Bajarildi");
    expect(JSON.stringify(senders.telegrams[0].buttons)).toContain(`${site}/tasks/t1`);
    expect(senders.pushes).toHaveLength(1);
    expect(store.inApp).toEqual(["Hisobotni yuborish"]);
    expect(store.reminders[0].status).toBe("sent");
  });

  it("queues reminders during quiet hours until they end", async () => {
    store.reminders.push({ id: "r2", user_id: "u1", task_id: "t1", title: null, remind_at: "2026-10-05T17:30:00Z", channels: ["telegram"], attempts: 0, status: "pending" });
    const res = await run("2026-10-05T17:31:00Z"); // 22:31 local
    expect(res.reminders.deferred).toBe(1);
    expect(senders.telegrams).toHaveLength(0);
    expect(store.reminders[0]).toMatchObject({ status: "pending", remind_at: "2026-10-06T02:00:00.000Z" });
    await run("2026-10-06T02:00:10Z"); // 07:00 local
    expect(senders.telegrams).toHaveLength(1);
  });

  it("dismisses reminders for completed tasks", async () => {
    store.taskMap.get("t1")!.status = "done";
    store.reminders.push({ id: "r3", user_id: "u1", task_id: "t1", title: null, remind_at: "2026-10-05T05:00:00Z", channels: ["telegram"], attempts: 0, status: "pending" });
    const res = await run("2026-10-05T05:00:30Z");
    expect(res.reminders.dismissed).toBe(1);
    expect(senders.telegrams).toHaveLength(0);
  });

  it("retries a failed delivery a few times, then gives up", async () => {
    store.prof.set("u1", profile({ digest_enabled: false, review_enabled: false, notify_prefs: { in_app: {}, telegram: { reminder: true }, push: {}, email: {} } }));
    store.reminders.push({ id: "r4", user_id: "u1", task_id: "t1", title: null, remind_at: "2026-10-05T05:00:00Z", channels: ["telegram"], attempts: 0, status: "pending" });
    senders.failTelegram = true;
    await run("2026-10-05T05:00:30Z");
    expect(store.reminders[0].status).toBe("pending");
    await run("2026-10-05T05:06:00Z");
    await run("2026-10-05T05:12:00Z");
    await run("2026-10-05T05:18:00Z");
    expect(store.reminders[0].status).toBe("failed");
  });
});

describe("notifications", () => {
  it("fans out by channel preference and defers during quiet hours", async () => {
    store.notifications.push({ id: "n1", user_id: "u1", type: "assigned", title: "Brend nomi", body: null, url: "/tasks/t9", actor_name: "Hamkor", delivery: "pending", deliver_after: "2026-10-05T00:00:00Z" });
    await run("2026-10-05T18:00:00Z"); // 23:00 local
    expect(senders.telegrams).toHaveLength(0);
    expect(store.notifications[0].delivery).toBe("pending");
    await run("2026-10-06T02:00:30Z");
    expect(senders.telegrams).toHaveLength(1);
    expect(senders.telegrams[0].html).toContain("Hamkor sizga vazifa berdi");
    expect(senders.pushes).toHaveLength(0); // push disabled for "assigned"
    expect(store.notifications[0].delivery).toBe("done");
  });
});

describe("daily digest and weekly review", () => {
  it("sends the digest once at the user's digest time", async () => {
    store.prof.set("u1", profile({ review_enabled: false }));
    store.taskMap.get("t1")!.top_date = "2026-10-05";
    await run("2026-10-05T02:29:00Z"); // 07:29
    expect(senders.telegrams).toHaveLength(0);
    const a = await run("2026-10-05T02:30:00Z"); // 07:30
    const b = await run("2026-10-05T02:31:00Z");
    expect(a.daily.digest).toBe(1);
    expect(b.daily.digest).toBe(0);
    expect(senders.telegrams).toHaveLength(1);
    const html = senders.telegrams[0].html;
    expect(html).toContain("Xayrli tong, Fayzullo!");
    expect(html).toContain("Asosiy 3 ish");
    expect(html).toContain("Hisobotni yuborish");
    expect(html).toContain("08:00–09:00 Agentlik");
  });

  it("works without Telegram: the digest and review arrive by push", async () => {
    store.prof.set("u1", profile({ review_enabled: true, telegram_chat_id: null, notify_prefs: { in_app: {}, telegram: {}, push: { digest: true, review: true }, email: {} } }));
    store.taskMap.get("t1")!.top_date = "2026-10-05";
    const res = await run("2026-10-05T02:30:00Z");
    expect(res.daily.digest).toBe(1);
    expect(senders.telegrams).toHaveLength(0);
    expect(senders.pushes).toContain("Xayrli tong, Fayzullo! Bugungi reja:");
    await run("2026-10-11T04:00:00Z"); // Sunday 09:00
    expect(senders.pushes).toContain("📊 Haftalik tahlil");
  });

  it("nudges to close the day at the shutdown time, by push, once", async () => {
    store.prof.set("u1", profile({ digest_enabled: false, review_enabled: false, telegram_chat_id: null, shutdown_enabled: true, shutdown_time: "18:30:00", last_shutdown_on: null }));
    const before = await run("2026-10-05T13:20:00Z"); // 18:20 Tashkent
    expect(before.daily.shutdown).toBe(0);
    const at = await run("2026-10-05T13:35:00Z");
    expect(at.daily.shutdown).toBe(1);
    expect(senders.pushes).toContain("Kunni yakunlash vaqti");
    const again = await run("2026-10-05T13:50:00Z");
    expect(again.daily.shutdown).toBe(0);
  });

  it("sends the weekly review on the chosen weekday", async () => {
    store.prof.set("u1", profile({ digest_enabled: false, language: "en" }));
    const res = await run("2026-10-11T04:00:00Z"); // Sunday 09:00
    expect(res.daily.review).toBe(1);
    expect(senders.telegrams[0].html).toContain("Done last week: 7");
  });
});
