import { createClient } from "@supabase/supabase-js";
import { expect, type Page, test } from "@playwright/test";

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "") || undefined;
const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

/** The suite needs a real Supabase project (local `supabase start` or a test project). */
export function requireSupabase() {
  test.skip(!url || !serviceKey || process.env.NEXT_PUBLIC_DEMO_MODE === "true", "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.test.local to run e2e tests");
}

export function admin() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

export function uniqueEmail(tag: string) {
  return `e2e+${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`;
}

/** Signs in through the real magic-link flow, using an admin-generated token instead of an inbox. */
export async function signIn(page: Page, email: string) {
  const { data, error } = await admin().auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink&next=/`);
}

export async function skipOnboarding(page: Page) {
  if (page.url().includes("/onboarding")) {
    await page.getByRole("button", { name: /Oʻtkazib yuborish|Skip/ }).click();
  }
  await expect(page).toHaveURL(/\/$/);
}

export async function cleanupUser(email: string) {
  const sb = admin();
  const { data } = await sb.from("profiles").select("id").eq("email", email).maybeSingle();
  if (data) await sb.auth.admin.deleteUser(data.id);
}
