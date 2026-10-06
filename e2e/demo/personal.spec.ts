import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { demoOnly, openDemo, REAL } from "./helpers";

// Phase 7: energy labels, prayer-aware planning, PWA badge and share target, Google Calendar card.

test.use({ viewport: { width: 1280, height: 860 } });

const sb = () =>
  createClient((process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/rest\/v1\/?$/, ""), (process.env.SUPABASE_SECRET_KEY ?? "").trim(), {
    auth: { persistSession: false },
  });

test("energy: label a task as quick work; Home suggests it for the next free gap, deep work in the morning", async ({ page }) => {
  demoOnly(); // fixes the clock to a morning; the real backend seeds by the real date
  await page.clock.install({ time: new Date("2026-10-06T04:00:00Z") }); // 09:00 in Tashkent
  await openDemo(page);
  await page.getByText("Barcha ochiq ishlarni bir joyga yozib chiqish").first().click();
  await page.getByRole("dialog").getByRole("radio", { name: "Tez ish" }).click();
  await page.keyboard.press("Escape");
  const row = page.locator("[data-task-id]", { hasText: "Barcha ochiq ishlarni bir joyga yozib chiqish" }).first();
  await expect(row.getByRole("img", { name: "Tez ish" })).toBeVisible();
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Hozir nima qilay?" }) });
  await expect(card).toContainText("Ertalabki fokus uchun — chuqur ish");
  await expect(card).toContainText("Avgust tushumi farqini solishtirish"); // a deep task, overdue
  await expect(card).toContainText("Barcha ochiq ishlarni bir joyga yozib chiqish");
});

test("energy label is saved on the real backend", async ({ page }) => {
  test.skip(!REAL, "real backend only");
  await openDemo(page);
  await page.getByText("Barcha ochiq ishlarni bir joyga yozib chiqish").first().click();
  await page.getByRole("dialog").getByRole("radio", { name: "Chuqur ish" }).click();
  await expect.poll(async () => (await sb().from("tasks").select("energy").eq("title", "Barcha ochiq ishlarni bir joyga yozib chiqish").order("updated_at", { ascending: false }).limit(1).single()).data?.energy, { timeout: 20_000 }).toBe("deep");
});

test("prayer times: off by default; switched on, the five prayers show on the day timeline", async ({ page }) => {
  await openDemo(page, "/settings/profile");
  const toggle = page.getByRole("switch", { name: "Namoz vaqtlarini hisobga olish" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(page.getByRole("combobox", { name: "Shahar" })).toContainText("Toshkent");
  await page.getByRole("combobox", { name: "Shahar" }).click();
  await page.getByRole("option", { name: "Samarqand" }).click();
  await expect(page.getByText(/Peshin \d\d:\d\d/)).toBeVisible();
  await page.waitForTimeout(REAL ? 1500 : 700);
  await page.goto("/");
  const timeline = page.getByRole("list", { name: "Kun jadvali" });
  await expect(timeline.getByRole("listitem", { name: /Peshin/ })).toBeAttached();
  await expect(timeline.getByRole("listitem", { name: /Shom/ })).toBeAttached();
  if (REAL) {
    const { data } = await sb().from("profiles").select("prayer_enabled, prayer_city").eq("name", "Demo foydalanuvchi").order("created_at", { ascending: false }).limit(1).single();
    expect(data).toEqual({ prayer_enabled: true, prayer_city: "Samarqand" });
  }
});

test("share target: text with a link shared to the app becomes an inbox task", async ({ page }) => {
  await openDemo(page);
  await page.goto(`/share-target?text=${encodeURIComponent("Yangi narxlar roʻyxati\nkoʻrib chiqing https://t.me/c/123/45")}`);
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(page.getByText("Yangi narxlar roʻyxati")).toBeVisible();
  if (REAL) {
    await expect.poll(async () => (await sb().from("tasks").select("source, project_id").eq("title", "Yangi narxlar roʻyxati")).data?.[0], { timeout: 20_000 }).toEqual({ source: "share", project_id: null });
  }
});

test("app badge shows today's open count where supported", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __badge: number[] }).__badge = [];
    Object.defineProperty(navigator, "setAppBadge", { value: (n: number) => ((window as unknown as { __badge: number[] }).__badge.push(n), Promise.resolve()), configurable: true });
    Object.defineProperty(navigator, "clearAppBadge", { value: () => Promise.resolve(), configurable: true });
  });
  await openDemo(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __badge: number[] }).__badge.at(-1) ?? 0)).toBeGreaterThan(0);
});

test("Google Calendar: without OAuth keys the card says it is coming, the ICS link stays", async ({ page }) => {
  await openDemo(page, "/settings/integrations");
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Google Calendar" }) });
  await expect(card.getByText("Tez orada")).toBeVisible();
  await expect(card.getByRole("link", { name: "Google Calendar’ni ulash" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: /Kalendar|ICS/i }).first()).toBeVisible();
});
