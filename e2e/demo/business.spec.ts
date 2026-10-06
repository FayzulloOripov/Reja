import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { openDemo, REAL } from "./helpers";

// Phase 6: pipeline, money, docs (each switchable per workspace) and goals fed by data —
// in the demo and (E2E_BACKEND=real) against Supabase.

test.use({ viewport: { width: 1280, height: 860 } });

const sb = () =>
  createClient((process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/rest\/v1\/?$/, ""), (process.env.SUPABASE_SECRET_KEY ?? "").trim(), {
    auth: { persistSession: false },
  });

async function settled(page: Page) {
  await page.waitForTimeout(REAL ? 1500 : 700);
}

test("pipeline: stale warnings, a lost deal needs a reason, a won deal becomes a project", async ({ page }) => {
  await openDemo(page, "/pipeline");
  await expect(page.getByRole("heading", { name: "Savdo voronkasi", level: 1 })).toBeVisible();
  const card = (title: RegExp) => page.getByRole("article", { name: title });
  // 20 days in negotiation, and an overdue next step
  await expect(card(/Restoran tarmogʻi/)).toContainText("14 kundan beri harakatsiz");
  await expect(card(/Oʻquv markazi/)).toContainText("Keyingi qadam kechikdi");

  // a new deal
  await page.getByRole("button", { name: "Yangi bitim" }).first().click();
  await page.getByLabel("Bitim nomi").fill("Avtosalon (demo) — reklama");
  await page.getByLabel("Summa").fill("12000000");
  await page.getByLabel("Keyingi qadam").fill("Qoʻngʻiroq");
  await page.getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByRole("listitem", { name: "Yangi lid" })).toContainText("Avtosalon (demo) — reklama");

  // lost: the reason is required
  await page.getByRole("button", { name: "«Avtosalon (demo) — reklama» bitimini koʻchirish" }).click();
  await page.getByRole("menuitem", { name: "Yutqazildi" }).click();
  const lost = page.getByRole("dialog");
  await expect(lost.getByRole("button", { name: "Yutqazildi deb belgilash" })).toBeDisabled();
  await lost.getByRole("textbox").fill("Raqobatchi arzonroq");
  await lost.getByRole("button", { name: "Yutqazildi deb belgilash" }).click();
  await expect(page.getByRole("listitem", { name: "Yutqazildi" })).toContainText("Raqobatchi arzonroq");

  // won: offered to become a project
  await page.getByRole("button", { name: "«TexnoSoft (demo) — CRM joriy etish» bitimini koʻchirish" }).click();
  await page.getByRole("menuitem", { name: "Yutildi" }).click();
  await expect(page.getByRole("dialog")).toContainText("yutildi!");
  await page.getByRole("button", { name: "Loyiha yaratish" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "TexnoSoft (demo) — CRM joriy etish" })).toBeVisible();
  await settled(page);

  if (REAL) {
    const { data: deal } = await sb().from("deals").select("id, project_id, closed_at").eq("title", "TexnoSoft (demo) — CRM joriy etish").order("created_at", { ascending: false }).limit(1).single();
    expect(deal!.project_id).toBeTruthy();
    expect(deal!.closed_at).toBeTruthy();
    const { data: history } = await sb().from("deal_stage_history").select("id").eq("deal_id", deal!.id);
    expect(history!.length).toBeGreaterThanOrEqual(2);
  }
});

test("money: totals, the partner's large expense is approved, the split shows who owes whom", async ({ page }) => {
  const since = new Date(Date.now() - 1000).toISOString();
  await openDemo(page, "/money");
  await expect(page.getByRole("heading", { name: "Pul", level: 1 })).toBeVisible();
  const pending = page.locator("section", { has: page.getByRole("heading", { name: /Tasdiq kutilmoqda/ }) });
  await expect(pending).toContainText("Yangi noutbuk");
  await expect(page.getByRole("heading", { name: "Hamkorlar ulushi" })).toBeVisible();
  await expect(page.getByText("Kim kimga beradi")).toBeVisible();
  await pending.getByRole("button", { name: "Tasdiqlash" }).click();
  await expect(page.getByRole("heading", { name: /Tasdiq kutilmoqda/ })).toHaveCount(0);

  // a large expense of my own waits for the partner
  await page.getByRole("button", { name: "Chiqim" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Summa").fill("6000000");
  await expect(dialog.getByRole("status")).toContainText("hamkor tasdigʻidan keyin");
  await dialog.getByLabel("Izoh").fill("Ofis mebeli");
  await dialog.getByRole("button", { name: "Saqlash" }).click();
  await expect(page.locator("section", { has: page.getByRole("heading", { name: /Tasdiq kutilmoqda/ }) })).toContainText("Hamkor tasdigʻini kutyapti");

  // income in dollars is converted at the workspace rate
  await page.getByRole("button", { name: "Kirim" }).click();
  await dialog.getByLabel("Summa").fill("100");
  await dialog.getByRole("combobox", { name: "Valyuta" }).click();
  await page.getByRole("option", { name: "USD" }).click();
  await expect(dialog.getByText("= 1 280 000 soʻm")).toBeVisible();
  await dialog.getByLabel("Izoh").fill("Dollar toʻlov");
  await dialog.getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Dollar toʻlov" })).toContainText("$100");
  await settled(page);

  if (REAL) {
    // seeded rows carry made-up created_at values: find this test's rows by when they changed
    const { data } = await sb().from("money_entries").select("status, approved_by, created_by").eq("note", "Yangi noutbuk").gte("approved_at", since);
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ status: "approved" });
    expect(data![0].approved_by).not.toBe(data![0].created_by);
    const { data: mine } = await sb().from("money_entries").select("status").eq("note", "Ofis mebeli").gte("created_at", since).single();
    expect(mine).toMatchObject({ status: "pending" });
    const { data: usd } = await sb().from("money_entries").select("amount_uzs").eq("note", "Dollar toʻlov").gte("created_at", since).single();
    expect(Number(usd!.amount_uzs)).toBe(1_280_000);
  }
});

test("docs: a document lists its linked tasks and its earlier version can be restored", async ({ page }) => {
  await openDemo(page, "/docs");
  await page.getByRole("link", { name: /Mijoz bilan uchrashuv qaydlari/ }).click();
  await expect(page.getByRole("heading", { name: "Bogʻlangan vazifalar" })).toBeVisible();
  await expect(page.locator("[data-task-id]", { hasText: "Brend nomi va shartnoma shablonini kelishish" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Tarix" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Asosiy savollar: byudjet va muddat.");
  await dialog.getByRole("button", { name: "Shu versiyani qaytarish" }).click();
  await expect(page.getByText("Asosiy savollar: byudjet va muddat.")).toBeVisible();
  await expect(page.getByText("Keyingi uchrashuv — payshanba")).toHaveCount(0);
  // the text before the restore is now a version too
  await page.getByRole("button", { name: "Tarix" }).click();
  await expect(page.getByRole("dialog").getByRole("list", { name: "Versiyalar" }).getByRole("listitem")).toHaveCount(2, { timeout: REAL ? 15_000 : 5_000 });
});

test("goals: a key result counts won deals; a manual check-in keeps its note", async ({ page }) => {
  await openDemo(page, "/goals");
  const goal = page.getByRole("article").filter({ hasText: "Agentlikni ishga tushirish" });
  await expect(goal).toContainText("Yutilgan bitimlar");
  const revenue = page.getByRole("article").filter({ hasText: "Oktabr: 120 mln soʻm tushum" });
  await revenue.getByRole("button", { name: "«Tushum» qiymatini yangilash" }).click();
  await page.getByLabel("Hozirgi").fill("60");
  await page.getByLabel("Izoh").fill("Yangi mijoz toʻladi");
  await page.getByRole("button", { name: "Saqlash" }).click();
  await expect(revenue).toContainText("60 / 120 mln soʻm");
  await revenue.getByRole("button", { name: "Oʻzgarish tarixi" }).first().click();
  await expect(revenue.getByRole("list", { name: "Yangilash izohlari" })).toContainText("Yangi mijoz toʻladi");
});

test("modules switch off per workspace: the menu entry goes and the page explains", async ({ page }) => {
  await openDemo(page, "/settings/workspace");
  const nav = page.getByRole("complementary", { name: "Asosiy menyu" });
  await expect(nav.getByRole("link", { name: "Pul" })).toBeVisible();
  await page.getByRole("switch", { name: "Pul" }).click();
  await expect(nav.getByRole("link", { name: "Pul" })).toHaveCount(0);
  await page.goto("/money");
  await expect(page.getByText("«Pul» bu ish maydonida yoqilmagan")).toBeVisible();
});
