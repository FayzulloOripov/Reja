import { expect, test } from "@playwright/test";
import { openDemo } from "./helpers";

// Phase 2: demo separation, export in the demo, import with review and summary, first-run wizard.

test.use({ viewport: { width: 1280, height: 860 } });

test("the demo lives behind /demo and can be left for sign-up", async ({ page }) => {
  await openDemo(page);
  await expect(page.getByText("Demo rejim: maʼlumotlar faqat shu brauzerda saqlanadi")).toBeVisible();
  await page.getByRole("link", { name: "Roʻyxatdan oʻtish" }).click();
  await expect(page).toHaveURL(/\/login\?from=demo/);
  await expect(page.getByText(/Demoda kiritganlaringiz shu brauzerda saqlanib qoldi/)).toBeVisible();
});

test("export works in the demo (built in the browser)", async ({ page }) => {
  await openDemo(page, "/settings/data");
  const [json] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "JSON yuklab olish" }).click()]);
  expect(json.suggestedFilename()).toMatch(/^reja-.*\.json$/);
  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Vazifalar CSV" }).click()]);
  expect(csv.suggestedFilename()).toMatch(/^reja-.*\.csv$/);
});

test("planner JSON import: review groups, import, read the summary", async ({ page }) => {
  await openDemo(page, "/settings/data");
  await page.locator('input[type="file"]').setInputFiles("e2e/fixtures/planner-sample.json");
  await expect(page.getByText(/3 ta vazifa, 3 ta yangi loyiha, 2 ta yangi soha qoʻshiladi/)).toBeVisible();
  // "Agentlik" already exists as a demo area, so its new project goes there
  await expect(page.getByRole("combobox", { name: "«Agentlik» sohasi" })).toContainText("Agentlik");
  await expect(page.getByText("Qayerga joylansin?")).toBeVisible();
  // put the "topcoach" tasks into the inbox instead of a new project
  await page.getByRole("combobox", { name: "«Topcoach» qayerga" }).click();
  await page.getByRole("option", { name: "Kiruvchi" }).click();
  await page.getByRole("button", { name: "Import qilish" }).click();
  await expect(page.getByText(/3 ta qoʻshildi, 1 ta oʻtkazib yuborildi — nomi yoʻq/)).toBeVisible();
  await page.getByRole("link", { name: /Kiruvchi/ }).first().click();
  await expect(page.getByText("Oylik hisobotni yakunlash (namuna)")).toBeVisible();
  // and it survives a reload
  await page.reload();
  await expect(page.getByText("Oylik hisobotni yakunlash (namuna)")).toBeVisible();
});

test("CSV import: map columns on a preview, then import", async ({ page }) => {
  await openDemo(page, "/settings/data");
  await page.locator('input[type="file"]').setInputFiles("e2e/fixtures/tasks-sample.csv");
  await expect(page.getByText("Ustunlarni moslang")).toBeVisible();
  // Uzbek headers are recognised; the preview shows the first rows
  await expect(page.getByRole("combobox", { name: "Vazifa nomi" })).toContainText("Vazifa");
  await expect(page.getByRole("cell", { name: "Qoʻngʻiroq qilish (namuna)" })).toBeVisible();
  await page.getByRole("button", { name: "Davom etish" }).click();
  await page.getByRole("button", { name: "Import qilish" }).click();
  await expect(page.getByText(/2 ta qoʻshildi, 1 ta oʻtkazib yuborildi/)).toBeVisible();
});

test("first-run wizard: every step can be skipped and it ends on Home", async ({ page }) => {
  await openDemo(page, "/onboarding");
  await expect(page.getByText("1/6-qadam")).toBeVisible();
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Oʻtkazib yuborish" }).click();
  await expect(page.getByText("6/6-qadam")).toBeVisible();
  await page.getByRole("button", { name: "Boshlash" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("wizard creates areas and projects inside them", async ({ page }) => {
  await openDemo(page, "/onboarding");
  await page.getByRole("button", { name: "Davom etish" }).click();
  await page.getByRole("button", { name: "Davom etish" }).click();
  await page.getByRole("button", { name: "Hamkor biznesi" }).click();
  await page.getByRole("textbox", { name: "«Hamkor biznesi» sohasiga loyiha" }).fill("Shiroq");
  await page.getByRole("textbox", { name: "«Hamkor biznesi» sohasiga loyiha" }).press("Enter");
  await expect(page.locator("li", { hasText: "Hamkor biznesi" }).getByText("Shiroq")).toBeVisible();
});
