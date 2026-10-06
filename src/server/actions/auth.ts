"use server";

import { z } from "zod";
import { siteUrl } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";
import { getServerSupabase } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "../rate-limit";

// phone keyboards add a space after an autocompleted address; case never matters in an email
const emailField = z.string().trim().toLowerCase().pipe(z.email().max(254));

const schema = z.object({
  email: emailField,
  next: z.string().max(500).optional().catch(undefined),
  language: z.enum(["uz", "en"]).optional(),
});

export type MagicLinkResult = { ok: true } | { ok: false; error: "invalid" | "rate_limited" | "failed" };

export async function sendMagicLink(input: z.input<typeof schema>): Promise<MagicLinkResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { email, language } = parsed.data;
  const next = parsed.data.next ? safeNext(parsed.data.next, "") || undefined : undefined;

  const ip = await clientIp();
  const allowed = (await rateLimit(`auth:ip:${ip}`, 10, 600)) && (await rateLimit(`auth:email:${email.toLowerCase()}`, 4, 600));
  if (!allowed) return { ok: false, error: "rate_limited" };

  const supabase = await getServerSupabase();
  const redirect = new URL("/auth/callback", siteUrl());
  if (next) redirect.searchParams.set("next", next);
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirect.toString(), shouldCreateUser: true, data: { language: language ?? "uz" } },
  });
  if (error) {
    if (/rate|too many/i.test(error.message)) return { ok: false, error: "rate_limited" };
    // the provider's own (English, technical) message stays in the server log, not on the screen
    console.error("sendMagicLink", error.message);
    return { ok: false, error: "failed" };
  }
  return { ok: true };
}

const codeSchema = z.object({ email: emailField, code: z.string().trim().regex(/^\d{6}$/) });

export type CodeResult = { ok: true } | { ok: false; error: "invalid" | "wrong" | "rate_limited" };

/**
 * The 6-digit code from the same email. An app installed on the home screen cannot receive the
 * link (the phone opens it in the browser), so the code is typed into the app instead.
 */
export async function verifyEmailCode(input: z.input<typeof codeSchema>): Promise<CodeResult> {
  const parsed = codeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { email, code } = parsed.data;
  const ip = await clientIp();
  const allowed = (await rateLimit(`auth:code:ip:${ip}`, 20, 600)) && (await rateLimit(`auth:code:${email}`, 6, 600));
  if (!allowed) return { ok: false, error: "rate_limited" };
  const supabase = await getServerSupabase();
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) {
    if (/rate|too many/i.test(error.message)) return { ok: false, error: "rate_limited" };
    return { ok: false, error: "wrong" };
  }
  return { ok: true };
}
