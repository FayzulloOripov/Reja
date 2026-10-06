import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { siteUrl } from "@/lib/env";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { sendEmail } from "@/server/email";
import { googleConfigured, serverEnv } from "@/server/env";
import { syncGoogle } from "@/server/google";
import { ListEmail } from "@/emails/digest";
import { serverT } from "@/server/i18n";
import { sendPush } from "@/server/push";
import { runScheduler, type Senders } from "@/server/scheduler/core";
import { supabaseSchedulerStore } from "@/server/scheduler/supabase-store";
import { sendTelegram, telegramConfigured } from "@/server/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(req: NextRequest): boolean {
  const secret = serverEnv.cronSecret;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const senders: Senders = {
  async telegram(chatId, html, buttons) {
    if (!telegramConfigured()) return;
    await sendTelegram(chatId, html, buttons);
  },
  push: (sub, payload) => sendPush(sub, payload),
  async email(to, subject, content, lang, attachments) {
    const t = serverT(lang);
    return sendEmail({ to, subject, react: ListEmail({ ...content, footer: t("email.footer"), lang, empty: t("bot.empty") }), attachments });
  },
};

/** Google Calendar: re-sync connections not synced for 15 minutes (a few per run). */
async function syncStaleGoogle(): Promise<number> {
  if (!googleConfigured()) return 0;
  const admin = getAdminSupabase();
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data } = await admin.from("google_connections").select("user_id").or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`).limit(5);
  let n = 0;
  for (const row of data ?? []) {
    try {
      await syncGoogle(admin, row.user_id as string);
      n++;
    } catch (e) {
      console.error("[google]", (e as Error).message);
    }
  }
  return n;
}

/** Called every minute by pg_cron via pg_net (see supabase/migrations/…_cron.sql). */
async function handle(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  const result = await runScheduler({
    store: supabaseSchedulerStore(getAdminSupabase()),
    senders,
    now: new Date(),
    t: (locale) => {
      const tr = serverT(locale);
      return (key, values) => tr(key as never, values as never);
    },
    siteUrl: siteUrl(),
  });
  if (result.errors.length) console.error("[scheduler]", result.errors.slice(0, 20));
  const google = await syncStaleGoogle();
  return NextResponse.json({ ok: true, ms: Date.now() - started, ...result, google, errors: result.errors.length });
}

export const POST = handle;
export const GET = handle;
