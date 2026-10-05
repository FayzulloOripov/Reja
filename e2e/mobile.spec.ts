import { expect, test } from "@playwright/test";
import { cleanupUser, requireSupabase, signIn, skipOnboarding, uniqueEmail } from "./helpers";

test.describe("mobile shell", () => {
  requireSupabase();
  const email = uniqueEmail("mobile");
  test.afterAll(() => cleanupUser(email));

  test("bottom tabs, quick add and the task sheet", async ({ page }) => {
    await signIn(page, email);
    await skipOnboarding(page);
    const nav = page.getByRole("navigation", { name: "Asosiy menyu" }).last();
    await expect(nav.getByRole("link", { name: "Bugun" })).toBeVisible();
    await nav.getByRole("button", { name: "Yangi vazifa" }).click();
    await page.getByRole("textbox", { name: "Tezkor qoʻshish" }).fill("Telefondan vazifa bugun");
    await page.getByRole("button", { name: "Qoʻshish", exact: true }).click();
    await page.getByText("Telefondan vazifa").click();
    await expect(page.getByRole("textbox", { name: "Vazifa nomi" })).toHaveValue("Telefondan vazifa");
  });
});
