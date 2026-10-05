"use server";

import { z } from "zod";
import { ListEmail } from "@/emails/digest";
import { siteUrl } from "@/lib/env";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";
import { emailConfigured, sendEmail } from "../email";
import { serverT } from "../i18n";
import { pushConfigured, sendPush } from "../push";
import { rateLimit } from "../rate-limit";
import { sendTelegram, telegramConfigured } from "../telegram";

const channel = z.enum(["telegram", "push", "email"]);

export interface IntegrationStatus {
  telegram: boolean;
  push: boolean;
  email: boolean;
}

export async function integrationStatus(): Promise<IntegrationStatus> {
  return { telegram: telegramConfigured(), push: pushConfigured(), email: emailConfigured() };
}

/** Sends a test message to the signed-in user on one channel. */
export async function sendTestNotification(input: string): Promise<{ ok: boolean; error?: string }> {
  const parsed = channel.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };
  if (!(await rateLimit(`test:${user.id}`, 10, 3600))) return { ok: false, error: "rate_limited" };

  const admin = getAdminSupabase();
  const { data: profile } = await admin.from("profiles").select("name, email, language, telegram_chat_id").eq("id", user.id).single();
  const t = serverT(profile?.language);
  try {
    if (parsed.data === "telegram") {
      if (!profile?.telegram_chat_id) return { ok: false, error: "not_linked" };
      await sendTelegram(profile.telegram_chat_id, t("bot.test"));
    } else if (parsed.data === "push") {
      const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", user.id);
      if (!subs?.length) return { ok: false, error: "no_devices" };
      for (const s of subs) {
        const res = await sendPush(s, { title: "Reja", body: t("bot.test"), url: "/settings/notifications", tag: "test" });
        if (res === "gone") await admin.from("push_subscriptions").delete().eq("id", s.id);
      }
    } else {
      if (!profile?.email) return { ok: false, error: "no_email" };
      await sendEmail({
        to: profile.email,
        subject: t("bot.test"),
        react: ListEmail({ heading: t("bot.test"), sections: [], button: t("email.openApp"), url: siteUrl(), footer: t("email.footer"), lang: profile.language ?? "uz" }),
      });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
