import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { REAL } from "./helpers";

// Real backend only: what someone types in the demo survives sign-up. The browser keeps the demo
// snapshot; after signing in, Settings → Data → «Hisobimga oʻtkazish» writes it to Supabase.

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
const key = (process.env.SUPABASE_SECRET_KEY ?? "").trim();

test.use({ viewport: { width: 1280, height: 860 } });

test("demo data moves into a new real account without losing anything", async ({ page }) => {
  test.skip(!REAL, "needs the real backend (E2E_BACKEND=real)");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // 1. use the demo: a project, a task with a subtask and a checklist, a completed task, an inbox task
  await page.goto("/demo");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.keyboard.press("q");
  await page.getByRole("textbox", { name: "Tezkor qoʻshish" }).fill("Demodagi inbox vazifa ertaga");
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: /Agentlik mijozlari/ }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Agentlik mijozlari" })).toBeVisible();
  await page.getByRole("button", { name: "Vazifa qoʻshish" }).first().click();
  await page.getByRole("textbox", { name: "Vazifa qoʻshish" }).fill("Demodagi loyiha vazifasi");
  await page.getByRole("textbox", { name: "Vazifa qoʻshish" }).press("Enter");
  await page.keyboard.press("Escape");
  await page.locator("[data-task-id]", { hasText: "Demodagi loyiha vazifasi" }).click();
  await page.getByRole("button", { name: "Kichik vazifa qoʻshish" }).click();
  await page.getByRole("textbox", { name: "Kichik vazifa qoʻshish" }).fill("Demodagi kichik vazifa");
  await page.getByRole("textbox", { name: "Kichik vazifa qoʻshish" }).press("Enter");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Band qoʻshish" }).click();
  await page.getByRole("textbox", { name: "Band qoʻshish" }).fill("Demodagi band");
  await page.getByRole("textbox", { name: "Band qoʻshish" }).press("Enter");
  await expect(page.getByRole("textbox", { name: "Nazorat bandi: Demodagi band" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.locator("[data-task-id]", { hasText: "Voronka sahifasidagi narxlarni yangilash" }).getByRole("checkbox").click();
  await page.waitForTimeout(800);

  // 2. leave the demo and sign up (a fresh real account, already through the setup wizard)
  await page.goto("/demo/exit");
  await expect(page).toHaveURL(/\/login\?from=demo/);
  const email = `e2e+import-${Date.now().toString(36)}@example.test`;
  const { data: created, error } = await sb.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: "Import sinovi" } });
  if (error) throw error;
  const uid = created.user.id;
  try {
    await sb.from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", uid);
    const { data: link, error: linkError } = await sb.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError || !link.properties) throw linkError ?? new Error("no magic link");
    await page.goto(`/auth/confirm?token_hash=${link.properties.hashed_token}&type=magiclink&next=/settings/data`);

    // 3. import "only what I entered"
    await expect(page.getByRole("heading", { name: "Demodagi maʼlumotlaringiz" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Hisobimga oʻtkazish" }).click();
    await expect(page.getByText(/ta vazifa hisobingizga oʻtkazildi/)).toBeVisible();

    // 4. everything arrived in Supabase, linked correctly
    await expect
      .poll(async () => (await sb.from("tasks").select("id").eq("created_by", uid).eq("source", "demo")).data?.length ?? 0, { timeout: 20_000 })
      .toBeGreaterThanOrEqual(4);
    const { data: tasks } = await sb.from("tasks").select("id, title, project_id, section_id, parent_id, status, due_date, workspace_id").eq("created_by", uid);
    const byTitle = Object.fromEntries((tasks ?? []).map((t) => [t.title, t]));
    expect(byTitle["Demodagi inbox vazifa"]).toMatchObject({ project_id: null });
    expect(byTitle["Demodagi inbox vazifa"].due_date).toBeTruthy();
    const projectTask = byTitle["Demodagi loyiha vazifasi"];
    expect(projectTask.project_id).toBeTruthy();
    expect(projectTask.section_id).toBeTruthy();
    expect(byTitle["Demodagi kichik vazifa"]).toMatchObject({ parent_id: projectTask.id });
    expect(byTitle["Voronka sahifasidagi narxlarni yangilash"]).toMatchObject({ status: "done" });
    const { data: project } = await sb.from("projects").select("name, area_id, workspace_id").eq("id", projectTask.project_id).single();
    expect(project).toMatchObject({ name: "Agentlik mijozlari" });
    expect(project!.area_id).toBeTruthy();
    const { data: checklist } = await sb.from("checklist_items").select("text, task_id").eq("task_id", projectTask.id);
    expect(checklist).toEqual([{ text: "Demodagi band", task_id: projectTask.id }]);

    // 5. and the account shows it
    await page.goto("/inbox");
    await expect(page.getByText("Demodagi inbox vazifa")).toBeVisible();
  } finally {
    await sb.auth.admin.deleteUser(uid);
  }
});
