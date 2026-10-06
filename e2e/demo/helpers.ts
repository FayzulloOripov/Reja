import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { seedDemoAccount } from "../../src/lib/demo/seed-account";

/**
 * These specs run in two modes:
 *   • default — the in-browser demo at /demo (no keys needed, runs in CI);
 *   • E2E_BACKEND=real — the same tests against the real Supabase backend: every test signs in a
 *     fresh user whose account is seeded with the demo's sample data (with a real partner and
 *     consultant), and the users are deleted again afterwards.
 */
export const REAL = process.env.E2E_BACKEND === "real";

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
const serviceKey = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

let adminClient: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (!url || !serviceKey) throw new Error("E2E_BACKEND=real needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY");
  adminClient ??= createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return adminClient;
}

const createdUsers: string[] = [];

test.afterEach(async () => {
  if (!REAL) return;
  for (const id of createdUsers.splice(0)) await admin().auth.admin.deleteUser(id);
});

async function realUser(name: string, local: string, tag: string) {
  const email = `e2e+${local}-${tag}@example.test`;
  const { data, error } = await admin().auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: name } });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  createdUsers.push(data.user.id);
  return { id: data.user.id, email };
}

/** Opens the app with the demo's sample data: the in-browser demo, or a seeded real account. */
export async function openDemo(page: Page, path = "/") {
  if (!REAL) {
    await page.goto("/demo");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if (path !== "/") await page.goto(path);
    return;
  }
  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const me = await realUser("Demo foydalanuvchi", "me", tag);
  const partner = await realUser("Hamkor (demo)", "partner", tag);
  const guest = await realUser("Konsultant (demo)", "guest", tag);
  await seedDemoAccount(admin(), { me: me.id, partner: partner.id, guest: guest.id });
  const { data, error } = await admin().auth.admin.generateLink({ type: "magiclink", email: me.email });
  if (error) throw error;
  await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink&next=/`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
  if (path !== "/") await page.goto(path);
}

/** Skip a test that only makes sense in the in-browser demo. */
export function demoOnly() {
  test.skip(REAL, "demo-only behaviour");
}

/** Buttons and links with no accessible name (icon-only controls must have aria-label). */
export async function unnamedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("button, a[href], [role=button], [role=checkbox]"))) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || el.closest("[aria-hidden=true], nextjs-portal")) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const labelledBy = el.getAttribute("aria-labelledby");
      const name =
        el.getAttribute("aria-label") ||
        (labelledBy && document.getElementById(labelledBy)?.textContent) ||
        el.textContent?.trim() ||
        el.getAttribute("title") ||
        el.querySelector("img[alt]")?.getAttribute("alt");
      if (!name?.trim()) out.push(el.outerHTML.slice(0, 160));
    }
    return out;
  });
}
