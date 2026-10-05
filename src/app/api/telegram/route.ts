import { Bot, webhookCallback, type Context } from "grammy";
import type { NextRequest } from "next/server";
import { addDays, startOfWeek, timeIn, todayIn } from "@/lib/dates";
import { siteUrl } from "@/lib/env";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { serverEnv } from "@/server/env";
import { serverT } from "@/server/i18n";
import { rateLimit } from "@/server/rate-limit";
import { completeTaskFor, createTaskFromText, moveTaskToTomorrow, type BotUser } from "@/server/tasks";
import { escapeHtml as esc } from "@/server/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Tr = ReturnType<typeof serverT>;

interface Profile extends BotUser {
  telegram_chat_id: number | null;
}

const PROFILE_COLS = "id, name, language, timezone, work_days, current_workspace_id, telegram_chat_id";

async function profileForChat(chatId: number): Promise<Profile | null> {
  const { data } = await getAdminSupabase().from("profiles").select(PROFILE_COLS).eq("telegram_chat_id", chatId).maybeSingle<Profile>();
  return data ?? null;
}

function trFor(ctx: Context, profile: Profile | null): Tr {
  return serverT(profile?.language ?? (ctx.from?.language_code === "en" ? "en" : "uz"));
}

function fmtDay(iso: string, lang: string) {
  const months = serverT(lang).raw("dates.monthsShort") as string[];
  return lang === "en" ? `${months[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8))}` : `${Number(iso.slice(8))}-${months[Number(iso.slice(5, 7)) - 1]}`;
}

interface ListTask {
  id: string;
  title: string;
  due_date: string | null;
  due_at: string | null;
  top_date: string | null;
  project_id: string | null;
}

async function listTasks(p: Profile, until: string): Promise<(ListTask & { project_name: string | null })[]> {
  const sb = getAdminSupabase();
  const { data } = await sb.rpc("responsible_open_tasks", { p_user: p.id, p_until: until });
  const rows = (data ?? []) as ListTask[];
  const ids = [...new Set(rows.map((r) => r.project_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: ps } = await sb.from("projects").select("id, name").in("id", ids);
    for (const x of ps ?? []) names.set(x.id, x.name);
  }
  return rows.map((r) => ({ ...r, project_name: r.project_id ? (names.get(r.project_id) ?? null) : null }));
}

function line(p: Profile, x: ListTask & { project_name: string | null }) {
  const time = x.due_at ? `<b>${timeIn(p.timezone, x.due_at)}</b> ` : "";
  return `• ${time}${esc(x.title)}${x.project_name ? ` <i>· ${esc(x.project_name)}</i>` : ""}`;
}

function createBot(): Bot {
  const bot = new Bot(serverEnv.telegramToken);

  // per-chat rate limit (shared across instances through Postgres)
  bot.use(async (ctx, next) => {
    const key = `tg:${ctx.chat?.id ?? ctx.from?.id ?? "x"}`;
    if (!(await rateLimit(key, 30, 60))) {
      if (ctx.callbackQuery) await ctx.answerCallbackQuery();
      return;
    }
    await next();
  });

  async function link(ctx: Context, code: string) {
    const t = trFor(ctx, null);
    const { data } = await getAdminSupabase().rpc("link_telegram", { p_code: code.trim(), p_chat_id: ctx.chat!.id, p_username: ctx.from?.username ?? null });
    if (!data) return ctx.reply(t("bot.badCode"));
    const p = await profileForChat(ctx.chat!.id);
    return ctx.reply(trFor(ctx, p)("bot.linked"));
  }

  bot.command("start", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    const code = ctx.match?.trim();
    if (code) return link(ctx, code);
    const p = await profileForChat(ctx.chat.id);
    return ctx.reply(trFor(ctx, p)(p ? "bot.help" : "bot.welcome"));
  });

  bot.command(["help", "yordam"], async (ctx) => {
    const p = await profileForChat(ctx.chat.id);
    return ctx.reply(trFor(ctx, p)("bot.help"));
  });

  // groups: "/ulash CODE" connects a project to this group
  bot.command("ulash", async (ctx) => {
    if (ctx.chat.type === "private") return;
    const t = trFor(ctx, null);
    const code = (ctx.match ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9]{6,16}$/.test(code)) return ctx.reply(t("bot.groupBadCode"));
    const sb = getAdminSupabase();
    const { data: project } = await sb.from("projects").select("id, name").eq("telegram_link_code", code).is("deleted_at", null).maybeSingle();
    if (!project) return ctx.reply(t("bot.groupBadCode"));
    await sb.from("projects").update({ telegram_chat_id: ctx.chat.id, telegram_link_code: null }).eq("id", project.id);
    return ctx.reply(t("bot.groupLinked", { name: project.name }));
  });

  async function requireProfile(ctx: Context): Promise<Profile | null> {
    if (ctx.chat?.type !== "private") return null;
    const p = await profileForChat(ctx.chat.id);
    if (!p) await ctx.reply(trFor(ctx, null)("bot.notLinked"));
    return p;
  }

  const open = (t: Tr, path = "/") => ({ inline_keyboard: [[{ text: t("bot.btnOpen"), url: `${siteUrl()}${path}` }]] });

  bot.command("bugun", async (ctx) => {
    const p = await requireProfile(ctx);
    if (!p) return;
    const t = trFor(ctx, p);
    const today = todayIn(p.timezone);
    const tasks = await listTasks(p, today);
    const top = tasks.filter((x) => x.top_date === today);
    const due = tasks.filter((x) => x.due_date === today && x.top_date !== today);
    const overdue = tasks.filter((x) => x.due_date && x.due_date < today && x.top_date !== today);
    const parts: string[] = [];
    if (top.length) parts.push(`<b>${esc(t("bot.top3"))}</b>\n${top.map((x) => line(p, x)).join("\n")}`);
    if (due.length) parts.push(`<b>${esc(t("bot.today"))}</b>\n${due.map((x) => line(p, x)).join("\n")}`);
    if (overdue.length) parts.push(`<b>${esc(t("bot.overdue"))}</b>\n${overdue.map((x) => `${line(p, x)} (${fmtDay(x.due_date!, p.language)})`).join("\n")}`);
    return ctx.reply(parts.length ? parts.join("\n\n") : t("bot.empty"), { parse_mode: "HTML", reply_markup: open(t) });
  });

  bot.command("ertaga", async (ctx) => {
    const p = await requireProfile(ctx);
    if (!p) return;
    const t = trFor(ctx, p);
    const tomorrow = addDays(todayIn(p.timezone), 1);
    const tasks = (await listTasks(p, tomorrow)).filter((x) => x.due_date === tomorrow || x.top_date === tomorrow);
    return ctx.reply(tasks.length ? `<b>${esc(t("bot.tomorrow"))}</b>\n${tasks.map((x) => line(p, x)).join("\n")}` : t("bot.empty"), { parse_mode: "HTML", reply_markup: open(t, "/upcoming") });
  });

  bot.command("hafta", async (ctx) => {
    const p = await requireProfile(ctx);
    if (!p) return;
    const t = trFor(ctx, p);
    const today = todayIn(p.timezone);
    const end = addDays(startOfWeek(today), 6);
    const tasks = (await listTasks(p, end)).filter((x) => x.due_date && x.due_date >= today);
    const days = [...new Set(tasks.map((x) => x.due_date!))].sort();
    const weekdays = t.raw("dates.weekdays") as string[];
    const body = days
      .map((d) => {
        const wd = weekdays[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7];
        return `<b>${esc(wd[0].toUpperCase() + wd.slice(1))}, ${fmtDay(d, p.language)}</b>\n${tasks.filter((x) => x.due_date === d).map((x) => line(p, x)).join("\n")}`;
      })
      .join("\n\n");
    return ctx.reply(body ? `<b>${esc(t("bot.week"))}</b>\n\n${body}` : t("bot.empty"), { parse_mode: "HTML", reply_markup: open(t, "/upcoming") });
  });

  bot.command("inbox", async (ctx) => {
    const p = await requireProfile(ctx);
    if (!p) return;
    const t = trFor(ctx, p);
    const { data } = await getAdminSupabase()
      .from("tasks")
      .select("id, title")
      .eq("created_by", p.id)
      .is("project_id", null)
      .is("deleted_at", null)
      .in("status", ["todo", "in_progress", "waiting"])
      .order("created_at", { ascending: false })
      .limit(20);
    const rows = data ?? [];
    return ctx.reply(rows.length ? `<b>${esc(t("bot.inbox"))}</b>\n${rows.map((x) => `• ${esc(x.title)}`).join("\n")}` : t("bot.empty"), { parse_mode: "HTML", reply_markup: open(t, "/inbox") });
  });

  async function create(ctx: Context, p: Profile, text: string, raw = false) {
    const t = trFor(ctx, p);
    const task = await createTaskFromText(getAdminSupabase(), p, text, { raw, source: "telegram" });
    const due = task.due_date ? ` · ${fmtDay(task.due_date, p.language)}${task.due_at ? ` ${timeIn(p.timezone, task.due_at)}` : ""}` : "";
    const where = task.projectName ? ` · ${task.projectName}` : "";
    return ctx.reply(`${esc(t(task.project_id ? "bot.created" : "bot.createdInbox", { title: task.title }))}${esc(where + due)}`, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: t("bot.btnUndo"), callback_data: `u:${task.id}` }, { text: t("bot.btnOpen"), url: `${siteUrl()}/tasks/${task.id}` }]] },
    });
  }

  bot.command("yangi", async (ctx) => {
    const p = await requireProfile(ctx);
    if (!p) return;
    const text = (ctx.match ?? "").trim();
    if (!text) return ctx.reply(trFor(ctx, p)("bot.newUsage"));
    return create(ctx, p, text);
  });

  // forwarded messages → inbox task with the text and the original sender
  bot.on("message", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    const msg = ctx.message;
    const text = (msg.text ?? msg.caption ?? "").trim();
    const p = await profileForChat(ctx.chat.id);
    if (!p) {
      // a bare code links the account too
      if (/^[A-Z0-9]{8}$/i.test(text)) return link(ctx, text);
      return ctx.reply(trFor(ctx, null)("bot.welcome"));
    }
    if (!text) return;
    if (msg.forward_origin) {
      const o = msg.forward_origin;
      const sender =
        o.type === "user" ? [o.sender_user.first_name, o.sender_user.last_name].filter(Boolean).join(" ") : o.type === "hidden_user" ? o.sender_user_name : o.type === "chat" ? (o.sender_chat.title ?? "") : o.type === "channel" ? (o.chat.title ?? "") : "";
      const t = trFor(ctx, p);
      const firstLine = text.split("\n")[0].slice(0, 200);
      const title = sender ? `${firstLine} — ${t("bot.forwardedFrom", { name: sender })}` : firstLine;
      const task = await createTaskFromText(getAdminSupabase(), { ...p }, title, { raw: true, source: "telegram" });
      if (text.length > firstLine.length) {
        await getAdminSupabase()
          .from("tasks")
          .update({ description: { type: "doc", content: text.split(/\n+/).map((l) => ({ type: "paragraph", content: [{ type: "text", text: l }] })) } })
          .eq("id", task.id);
      }
      return ctx.reply(t("bot.createdInbox", { title: task.title }), {
        reply_markup: { inline_keyboard: [[{ text: t("bot.btnUndo"), callback_data: `u:${task.id}` }, { text: t("bot.btnOpen"), url: `${siteUrl()}/tasks/${task.id}` }]] },
      });
    }
    if (text.startsWith("/")) return ctx.reply(trFor(ctx, p)("bot.help"));
    return create(ctx, p, text);
  });

  // reminder buttons: d = done, s = snooze 1h, t = tomorrow, u = undo a task created here
  bot.on("callback_query:data", async (ctx) => {
    const [kind, id] = ctx.callbackQuery.data.split(":");
    const chatId = ctx.chat?.id ?? ctx.from.id;
    const p = await profileForChat(chatId);
    const t = trFor(ctx, p);
    if (!p || !id) return ctx.answerCallbackQuery({ text: t("bot.notLinked") });
    const sb = getAdminSupabase();

    if (kind === "u") {
      const { data: task } = await sb.from("tasks").select("id, created_by, created_at").eq("id", id).maybeSingle();
      if (task && task.created_by === p.id && Date.now() - Date.parse(task.created_at) < 24 * 3600_000) {
        await sb.from("tasks").update({ deleted_at: new Date().toISOString() }).eq("id", id);
        await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => {});
        return ctx.answerCallbackQuery({ text: t("bot.undone") });
      }
      return ctx.answerCallbackQuery();
    }

    const { data: reminder } = await sb.from("reminders").select("id, user_id, task_id, remind_at").eq("id", id).maybeSingle();
    if (!reminder || reminder.user_id !== p.id) return ctx.answerCallbackQuery();
    let note = "";
    if (kind === "d") {
      if (reminder.task_id) await completeTaskFor(sb, reminder.task_id, p.id, p.timezone);
      await sb.from("reminders").update({ status: "dismissed" }).eq("id", id);
      note = t("bot.done");
    } else if (kind === "s") {
      await sb.from("reminders").update({ status: "snoozed", remind_at: new Date(Date.now() + 3600_000).toISOString(), sent_at: null }).eq("id", id);
      note = t("bot.snoozed");
    } else if (kind === "t") {
      if (reminder.task_id) await moveTaskToTomorrow(sb, reminder.task_id, p.id, p.timezone);
      // the reminder follows the new due date automatically for task reminders; standalone ones move a day
      if (!reminder.task_id) await sb.from("reminders").update({ status: "pending", remind_at: new Date(Date.parse(reminder.remind_at) + 86_400_000).toISOString(), sent_at: null }).eq("id", id);
      note = t("bot.movedTomorrow");
    }
    const original = ctx.callbackQuery.message && "text" in ctx.callbackQuery.message ? (ctx.callbackQuery.message.text ?? "") : "";
    await ctx.editMessageText(`${esc(original)}\n\n${esc(note)}`, { parse_mode: "HTML" }).catch(() => {});
    return ctx.answerCallbackQuery({ text: note });
  });

  bot.catch((err) => {
    console.error("[telegram]", err.error);
  });

  return bot;
}

let handler: ((req: Request) => Promise<Response>) | null = null;

export async function POST(req: NextRequest) {
  if (!serverEnv.telegramToken) return new Response("not configured", { status: 503 });
  // Telegram echoes the secret we registered with setWebhook; reject anything else.
  if (serverEnv.telegramWebhookSecret && req.headers.get("x-telegram-bot-api-secret-token") !== serverEnv.telegramWebhookSecret) {
    return new Response("forbidden", { status: 403 });
  }
  handler ??= webhookCallback(createBot(), "std/http", { secretToken: serverEnv.telegramWebhookSecret || undefined });
  return handler(req);
}
