import { expect, test } from "@playwright/test";
import { openDemo } from "./helpers";

// Regression tests for the phone-width bugs (390 px).

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test("undo toast sits above the bottom tab bar", async ({ page }) => {
  await openDemo(page, "/upcoming");
  await page.locator("[data-task-id]", { hasText: "Oktabr maqsadini menejer bilan kelishish" }).getByRole("checkbox").click();
  const toast = page.getByRole("button", { name: "Qaytarish" });
  await expect(toast).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Asosiy menyu" }).last();
  const navTop = (await nav.boundingBox())!.y;
  // the toast slides in from the bottom: wait until it has settled above the tab bar
  await expect.poll(async () => {
    const t = await toast.boundingBox();
    return t ? t.y + t.height : Infinity;
  }).toBeLessThanOrEqual(navTop);
});

test("settings: tile in the «Yana» sheet and a section list on phones", async ({ page }) => {
  await openDemo(page);
  await page.getByRole("button", { name: "Yana" }).click();
  await page.getByRole("link", { name: "Sozlamalar" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("link", { name: /Bildirishnomalar/ })).toBeVisible();
  await page.getByRole("link", { name: /Bildirishnomalar/ }).click();
  // one card per event with labelled switches, full phrases
  await expect(page.getByRole("listitem").getByText("Kimdir sizga vazifa berdi")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Kimdir sizga vazifa berdi: Push" })).toBeVisible();
  // Telegram is postponed: no Telegram switches
  await expect(page.getByRole("switch", { name: /: Telegram$/ })).toHaveCount(0);
  // push does not claim the browser refused before the user tried
  await expect(page.getByText(/toʻsib qoʻygan|ruxsat bermadi/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Shu qurilmada yoqish" })).toHaveCount(1);
});

test("board columns snap and show which column is visible", async ({ page }) => {
  await openDemo(page);
  await page.goto("/");
  await page.getByRole("navigation", { name: "Asosiy menyu" }).last().getByRole("link", { name: "Loyihalar" }).click();
  await page.getByRole("main").getByRole("link", { name: /Sotuv boʻlimi/ }).click();
  await page.getByRole("button", { name: /Doska/ }).click();
  await expect(page.getByText(/^1\/4$/)).toBeVisible();
});

test("calendar opens as an agenda on phones", async ({ page }) => {
  await openDemo(page);
  await page.getByRole("navigation", { name: "Asosiy menyu" }).last().getByRole("link", { name: "Loyihalar" }).click();
  await page.getByRole("main").getByRole("link", { name: /Sotuv boʻlimi/ }).click();
  await page.getByRole("button", { name: /Kalendar/ }).click();
  await expect(page.getByRole("radio", { name: "Roʻyxat" })).toHaveAttribute("aria-checked", "true");
});

test("file area says «Fayl tanlash» on phones", async ({ page }) => {
  await openDemo(page);
  await page.getByText("Oylik hisobotni yakunlash va menejerga topshirish").first().click();
  await expect(page.getByText("Fayl tanlash").first()).toBeVisible();
});

test("no page scrolls sideways at phone width", async ({ page }) => {
  await openDemo(page);
  for (const path of ["/", "/inbox", "/upcoming", "/waiting", "/projects", "/overview", "/goals", "/habits", "/focus", "/reports", "/workload", "/notifications", "/settings", "/settings/notifications", "/settings/data", "/onboarding"]) {
    await page.goto(path);
    await page.waitForTimeout(400);
    const [doc, win] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(doc, path).toBeLessThanOrEqual(win);
  }
});

// A busy manager on a phone (second review round)

test("inbox on a phone: one tap files a task into a project", async ({ page }) => {
  await openDemo(page, "/inbox");
  const row = page.locator("[data-task-id]", { hasText: "Kiyim uslubi" });
  await row.getByRole("button", { name: "Loyihaga" }).click();
  await page.getByRole("option", { name: /Agentlik mijozlari/ }).click();
  await expect(page.locator("[data-task-id]", { hasText: "Kiyim uslubi" })).toHaveCount(0);
});

test("Home names what comes next, and quick add says where a delegated task went", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-07T03:30:00Z") }); // 08:30 in Tashkent
  await openDemo(page);
  await expect(page.getByText("Keyingisi")).toBeVisible();
  await page.getByRole("button", { name: "Yangi vazifa" }).last().click();
  const input = page.getByRole("textbox", { name: "Tezkor qoʻshish" });
  await input.fill("Asilaga taklifni yuborish juma 15:00 #Agentlik @Hamkor");
  await input.press("Enter");
  await expect(page.getByText(/Agentlik mijozlari · Juma 15:00 · Hamkor/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Ochish" })).toBeVisible();
});

test("waiting list: every open item has a follow-up button", async ({ page }) => {
  await openDemo(page, "/waiting");
  await expect(page.getByRole("button", { name: "Soʻrash" }).first()).toBeVisible();
});
