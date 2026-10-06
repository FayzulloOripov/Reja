import { expect, test } from "@playwright/test";
import { openDemo } from "./helpers";

// Phase 3: Projects page and areas, workload, activity, delegated work.

test.use({ viewport: { width: 1280, height: 860 } });

test("projects page groups by area, filters, archives and restores", async ({ page }) => {
  await openDemo(page);
  await page.getByRole("link", { name: "Loyihalar", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("region", { name: "Asosiy ish (demo)" })).toContainText("Sotuv boʻlimi (demo)");
  await expect(page.getByRole("region", { name: "Agentlik" })).toContainText("Agentlik mijozlari");
  await page.getByRole("textbox", { name: "Loyihani qidirish" }).fill("klinika");
  await expect(page.getByRole("main").getByRole("link", { name: "Demo klinika" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Agentlik mijozlari" })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Loyihani qidirish" }).fill("");

  await page.getByRole("button", { name: "«Demo klinika» amallari" }).click();
  await page.getByRole("menuitem", { name: "Arxivlash" }).click();
  await expect(page.getByRole("main").getByRole("link", { name: "Demo klinika" })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Holat", exact: true }).click();
  await page.getByRole("option", { name: "Arxivda" }).click();
  await page.getByRole("button", { name: "«Demo klinika» amallari" }).click();
  await page.getByRole("menuitem", { name: "Arxivdan chiqarish" }).click();
  await page.getByRole("combobox", { name: "Holat", exact: true }).click();
  await page.getByRole("option", { name: "Faol va toʻxtatilgan" }).click();
  await expect(page.getByRole("main").getByRole("link", { name: "Demo klinika" })).toBeVisible();
});

test("favourite from the projects page shows in the sidebar", async ({ page }) => {
  await openDemo(page, "/projects");
  await page.getByRole("listitem").filter({ hasText: "Demo klinika" }).getByRole("button", { name: "Sevimlilarga qoʻshish" }).click();
  await expect(page.getByRole("complementary").getByText("Sevimlilar")).toBeVisible();
});

test("activity feed shows what just happened, with names", async ({ page }) => {
  await openDemo(page);
  await page.getByRole("link", { name: /Agentlik mijozlari/ }).first().click();
  await expect(page.getByRole("textbox", { name: "Nomi" })).toHaveValue("Agentlik mijozlari");
  // add a task with a subtask
  await page.getByRole("button", { name: "Vazifa qoʻshish" }).first().click();
  await page.getByRole("textbox", { name: "Vazifa qoʻshish" }).fill("Faollik sinovi");
  await page.getByRole("textbox", { name: "Vazifa qoʻshish" }).press("Enter");
  await page.keyboard.press("Escape");
  await page.locator("[data-task-id]", { hasText: "Faollik sinovi" }).click();
  await page.getByRole("button", { name: "Kichik vazifa qoʻshish" }).click();
  await page.getByRole("textbox", { name: "Kichik vazifa qoʻshish" }).fill("Ichki qadam");
  await page.getByRole("textbox", { name: "Kichik vazifa qoʻshish" }).press("Enter");
  await expect(page.getByText("Siz yaratgansiz")).toBeVisible();
  // first Escape leaves the subtask field, the second closes the panel
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /Umumiy/ }).click();
  await expect(page.getByText("Siz «Faollik sinovi» vazifasini yaratdi")).toBeVisible();
});

test("workload counts the creator's own tasks and shows no unassigned pile", async ({ page }) => {
  await openDemo(page, "/workload");
  const me = page.getByRole("row", { name: /Demo foydalanuvchi/ });
  await expect(me).toBeVisible();
  const total = Number(await me.getByRole("rowheader").locator(".tnum").innerText());
  expect(total).toBeGreaterThan(3);
  await expect(page.getByText("Ijrochisiz")).toHaveCount(0);
});

test("delegated tasks stay visible: Home card and Kutilmoqda", async ({ page }) => {
  await openDemo(page);
  await page.keyboard.press("q");
  await page.getByRole("textbox", { name: "Tezkor qoʻshish" }).fill("Asila bilan uchrashuv ertaga 10:00 @Hamkor");
  await page.keyboard.press("Enter");
  const card = page.getByRole("region", { name: /Boshqalardan kutilayotgan/ });
  await expect(card).toContainText("Asila bilan uchrashuv");
  await card.getByRole("link", { name: /Hammasi/ }).click();
  await expect(page).toHaveURL(/\/waiting/);
  await expect(page.getByRole("rowgroup", { name: "Hamkor (demo)" })).toContainText("Asila bilan uchrashuv");
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("the Loyihalar tab opens the Projects page", async ({ page }) => {
    await openDemo(page);
    await page.getByRole("navigation", { name: "Asosiy menyu" }).last().getByRole("link", { name: "Loyihalar" }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole("heading", { name: "Loyihalar", level: 1 })).toBeVisible();
  });
});
