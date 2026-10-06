import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { admin, currentUser, openDemo, REAL } from "./helpers";

// Phase 8: devices (sign out elsewhere), the admins' audit log, backups and the full export.

test.use({ viewport: { width: 1280, height: 860 } });

test("devices: this device is listed; another sign-in can be signed out", async ({ page }) => {
  await openDemo(page, "/settings/profile");
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Qurilmalar" }) });
  if (!REAL) {
    await expect(card).toContainText("Demoda mavjud emas");
    return;
  }
  await expect(card.getByText("Shu qurilma")).toBeVisible();
  // sign the same user in somewhere else (a second session)
  const { data: link } = await admin().auth.admin.generateLink({ type: "magiclink", email: currentUser!.email });
  const other = createClient((process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/rest\/v1\/?$/, ""), (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim(), { auth: { persistSession: false } });
  const { error } = await other.auth.verifyOtp({ token_hash: link.properties!.hashed_token, type: "magiclink" });
  expect(error).toBeNull();
  await page.reload();
  await expect(card.getByRole("listitem")).toHaveCount(2);
  await card.getByRole("button", { name: "Chiqish", exact: true }).click();
  await expect(card.getByRole("listitem")).toHaveCount(1);
  await expect(card.getByText("Shu qurilma")).toBeVisible();
});

test("audit log: admins see members added, module changes and exports", async ({ page }) => {
  test.skip(!REAL, "the audit log is written by the database");
  await openDemo(page, "/settings/workspace");
  // an export and a module change are recorded
  const wsId = (await admin().from("profiles").select("current_workspace_id").eq("id", currentUser!.id).single()).data!.current_workspace_id as string;
  expect((await page.request.get(`/api/export?workspace=${wsId}&format=json`)).ok()).toBe(true);
  await page.getByRole("switch", { name: "Hujjatlar" }).click();
  await page.waitForTimeout(1500);
  await page.reload();
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Audit jurnali" }) });
  await expect(card).toContainText("«Hamkor (demo)»ni qoʻshdi");
  await expect(card).toContainText("maʼlumotlarni yuklab oldi (json)");
  await expect(card).toContainText("modullarni oʻzgartirdi");
});

test("backups: weekly email switch, and everything in one download", async ({ page }) => {
  await openDemo(page, "/settings/data");
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Zaxira nusxa" }) });
  await expect(card.getByRole("switch", { name: "Haftalik zaxira nusxa emailga" })).toHaveAttribute("aria-checked", "true");
  if (!REAL) return;
  const res = await page.request.get("/api/export?scope=account");
  expect(res.ok()).toBe(true);
  const json = await res.json();
  expect(json.workspaces.length).toBeGreaterThanOrEqual(2);
  expect(json.personal.habits.length).toBeGreaterThan(0);
  const team = json.workspaces.find((w: { workspace: { name: string } }) => w.workspace.name === "Demo agentlik");
  expect(team.deals.length).toBeGreaterThan(0);
  expect(team.money_entries.length).toBeGreaterThan(0);
});
