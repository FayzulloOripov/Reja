import { expect, test } from "@playwright/test";
import { admin, cleanupUser, requireSupabase, signIn, skipOnboarding, uniqueEmail } from "./helpers";

test.describe("core flow", () => {
  requireSupabase();
  const email = uniqueEmail("owner");
  test.afterAll(() => cleanupUser(email));

  test("sign up → project → quick add with parsing → board → reminder → complete → reports", async ({ page }) => {
    await signIn(page, email);
    await skipOnboarding(page);

    // create a project
    await page.getByRole("button", { name: /Yangi vazifa/ }).first().waitFor();
    await page.goto("/");
    await page.keyboard.press("q");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Yangi loyiha" }).first().click();
    await page.getByLabel("Nomi").fill("Topcoach E2E");
    await page.getByRole("button", { name: "Mijoz loyihasi" }).click(); // template with sections
    await page.getByRole("button", { name: "Yaratish" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Topcoach E2E" })).toBeVisible();

    // quick add with natural language parsing
    await page.keyboard.press("q");
    const input = page.getByRole("textbox", { name: "Tezkor qoʻshish" });
    await input.fill("Hisobotni yuborish ertaga 10:00 #Topcoach !1");
    await expect(page.getByRole("button", { name: /Ertaga/ })).toContainText("10:00");
    await expect(page.getByRole("button", { name: /Shoshilinch/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Topcoach E2E/ })).toBeVisible();
    await input.press("Enter");
    await expect(page.getByText("Vazifa qoʻshildi")).toBeVisible();

    // board: move the task to the "Ish jarayoni" column
    await page.getByRole("button", { name: /Doska/ }).click();
    const card = page.locator("article", { hasText: "Hisobotni yuborish" });
    const target = page.getByRole("listitem", { name: "Ish jarayoni" });
    await card.hover();
    await page.mouse.down();
    const box = (await target.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 80, { steps: 12 });
    await page.mouse.up();
    await expect(target.locator("article", { hasText: "Hisobotni yuborish" })).toBeVisible();

    // open the task and add a reminder
    await target.locator("article", { hasText: "Hisobotni yuborish" }).click();
    await page.getByRole("button", { name: /Eslatma qoʻshish/ }).click();
    await page.getByRole("button", { name: "1 soat oldin" }).click();
    await expect(page.locator("text=09:00").first()).toBeVisible();

    // the reminder exists server-side
    await expect
      .poll(async () => {
        const { data } = await admin().from("reminders").select("offset_rule").eq("offset_rule", "1h");
        return data?.length ?? 0;
      })
      .toBeGreaterThan(0);

    // complete it
    await page.getByRole("checkbox", { name: "Bajarildi deb belgilash" }).first().click();
    await expect(page.getByText(/bajarildi/).first()).toBeVisible();

    // it shows up in reports
    await page.goto("/reports");
    await expect(page.getByText("Jami bajarilgan").locator("..").locator("..")).toContainText("1");
  });
});
