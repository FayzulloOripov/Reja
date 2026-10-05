"use server";

import { z } from "zod";
import { siteUrl } from "@/lib/env";
import { getServerSupabase } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "../rate-limit";

const schema = z.object({
  email: z.email().max(254),
  next: z.string().max(500).regex(/^\/(?!\/)/).optional().catch(undefined),
  language: z.enum(["uz", "en"]).optional(),
});

export type MagicLinkResult = { ok: true } | { ok: false; error: "invalid" | "rate_limited" | "failed"; message?: string };

export async function sendMagicLink(input: z.input<typeof schema>): Promise<MagicLinkResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { email, next, language } = parsed.data;

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
    return { ok: false, error: "failed", message: error.message };
  }
  return { ok: true };
}
