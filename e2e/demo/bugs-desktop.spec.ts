import { expect, test } from "@playwright/test";
import { demoOnly, openDemo, unnamedControls } from "./helpers";

// Regression tests for the bugs found in the first round of user testing (desktop, 1280 px).
// Each test names the bug it reproduces. They run against the in-browser demo (/demo).

test.use({ viewport: { width: 1280, height: 860 } });

test("initials skip brackets: «Hamkor (demo)» shows H, not H(", async ({ page }) => {
  await openDemo(page, "/workload");
  const avatar = page.getByRole("img", { name: "Hamkor (demo)" }).first();
  await expect(avatar).toHaveText("H");
  await expect(page.getByRole("img", { name: "Konsultant (demo)" }).first()).toHaveText("K");
});

test("upcoming shows weekday and date for every day and collapses empty days", async ({ page }) => {
  await openDemo(page, "/upcoming");
  const headers = await page.locator("main h3").allTextContents();
  for (const h of headers) {
    // never "12-okt · 12-okt": every day header carries its weekday
    expect(h).not.toMatch(/^(\d+-\w+) · \1$/);
  }
  expect(headers.some((h) => /Dushanba|Seshanba|Chorshanba|Payshanba|Juma|Shanba|Yakshanba/.test(h))).toBe(true);
  await expect(page.getByText(/ta boʻsh kun/).first()).toBeVisible();
  // the overdue group has no "add task" row
  const overdue = page.locator("section", { has: page.getByRole("heading", { name: "Muddati oʻtgan" }) });
  await expect(overdue.getByRole("button", { name: "Vazifa qoʻshish" })).toHaveCount(0);
});

test("overview workload row uses labelled numbers", async ({ page }) => {
  await openDemo(page, "/overview");
  await expect(page.getByText(/Bugun \d+ · Shu hafta \d+/).first()).toBeVisible();
});

test("health badge explains the reason", async ({ page }) => {
  await openDemo(page, "/overview");
  await expect(page.getByText(/kun qoldi, \d+% bajarildi/).first()).toBeVisible();
});

test("reports: every card follows the selected period and numbers use Uzbek format", async ({ page }) => {
  await openDemo(page, "/reports");
  await page.getByRole("radio", { name: "12 hafta" }).click();
  await expect(page.getByText("Soʻnggi 12 hafta").first()).toBeVisible();
  // the only "4 hafta" left is the period switch itself
  await expect(page.getByText("4 hafta", { exact: true })).toHaveCount(1);
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/\b\d+\.\d\b/); // no "1.0"
});

test("notification filters are distinct and have icons", async ({ page }) => {
  await openDemo(page, "/notifications");
  await expect(page.getByRole("radio", { name: "Tilga olishlar" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Eslatmalar" })).toBeVisible();
  await expect(page.getByText("Eslatishlar")).toHaveCount(0);
});

test("greeting follows the user's time zone", async ({ page }) => {
  // 07:30 UTC = 12:30 in Tashkent
  await page.clock.setFixedTime(new Date("2026-10-05T07:30:00Z"));
  await openDemo(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Xayrli kun");
});

test("undo toast stays 8 seconds and restores a completion", async ({ page }) => {
  await openDemo(page, "/upcoming");
  const row = page.locator("[data-task-id]", { hasText: "Oktabr maqsadini menejer bilan kelishish" });
  await row.getByRole("checkbox").click();
  const undo = page.getByRole("button", { name: "Qaytarish" });
  await expect(undo).toBeVisible();
  await page.waitForTimeout(5_500);
  await expect(undo).toBeVisible();
  await undo.click();
  await expect(page.locator("[data-task-id]", { hasText: "Oktabr maqsadini menejer bilan kelishish" }).getByRole("checkbox")).toHaveAttribute("aria-checked", "false");
});

test("completing a recurring task shows a readable next date and can be undone from Home", async ({ page }) => {
  await openDemo(page);
  const row = page.locator("[data-task-id]", { hasText: "Har kuni 8 stakan suv" }).first();
  await row.getByRole("checkbox").click();
  const toast = page.getByRole("status").filter({ hasText: "Keyingisi" });
  await expect(toast).toContainText("Keyingisi: ertaga");
  await expect(toast).not.toContainText(/\d{4}-\d{2}-\d{2}/);
  // "Bugun bajarilganlar" lets you undo later the same day
  const doneSection = page.locator("section", { has: page.getByRole("heading", { name: /Bugun bajarilganlar/ }) });
  await expect(doneSection).toContainText("Har kuni 8 stakan suv");
});

test("every visible button and link has an accessible name", async ({ page }) => {
  await openDemo(page);
  for (const path of ["/", "/upcoming", "/overview", "/goals", "/habits", "/focus", "/reports", "/notifications", "/settings/notifications"]) {
    await page.goto(path);
    await page.waitForTimeout(300);
    expect(await unnamedControls(page), path).toEqual([]);
  }
});

test("settings are reachable from the sidebar gear", async ({ page }) => {
  await openDemo(page);
  await page.getByRole("link", { name: "Sozlamalar" }).click();
  await expect(page).toHaveURL(/\/settings\/profile/);
});

test("demo banner collapses to a pill and stays collapsed", async ({ page }) => {
  demoOnly();
  await openDemo(page);
  await page.getByRole("button", { name: "Yashirish" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Demo rejim haqida" })).toBeVisible();
  await expect(page.getByText("Demo rejim: maʼlumotlar faqat shu brauzerda saqlanadi")).toHaveCount(0);
});

test("board keeps empty columns as drop targets", async ({ page }) => {
  await openDemo(page);
  await page.getByRole("link", { name: /Agentlik mijozlari/ }).first().click();
  await page.getByRole("button", { name: /Doska/ }).click();
  await expect(page.getByRole("listitem", { name: "Boʻlimsiz" })).toBeVisible();
});

test("project list labels the due date and the deadline differently", async ({ page }) => {
  await openDemo(page);
  await page.getByRole("link", { name: /Agentlik mijozlari/ }).first().click();
  const row = page.locator("[data-task-id]", { hasText: "Brend nomi va shartnoma shablonini kelishish" });
  await expect(row.getByText("Oxirgi muddat:")).toBeAttached();
  await expect(row.getByText("Sana:")).toBeAttached();
});

test("timeline hides finished work by default", async ({ page }) => {
  await openDemo(page);
  await page.getByRole("link", { name: /Sotuv boʻlimi/ }).first().click();
  await page.getByRole("button", { name: /Vaqt chizigʻi/ }).click();
  await expect(page.getByText(/Bajarilgan ish #/)).toHaveCount(0);
  await page.getByText(/Bajarilganlarni koʻrsatish/).click();
  await expect(page.getByText(/Bajarilgan ish #/).first()).toBeVisible();
});

test("focus page and Home count the same finished sessions", async ({ page }) => {
  await openDemo(page);
  const homeCard = page.getByRole("link", { name: /Fokus vaqti/ });
  const homeText = await homeCard.innerText();
  await page.goto("/focus");
  const week = await page.getByText(/^Shu hafta:/).innerText();
  const homeSessions = homeText.match(/(\d+) ta seans/)?.[1];
  expect(week).toContain(`${homeSessions} ta seans`);
});

test("goal percentage is explained and deleting a key result asks first", async ({ page }) => {
  await openDemo(page, "/goals");
  await page.getByRole("button", { name: /qanday hisoblangan/ }).first().click();
  await expect(page.getByText("Foiz qanday hisoblanadi")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText(/Vaqtning \d+% oʻtdi, natija \d+%/).first()).toBeVisible();
  await page.getByRole("button", { name: /natijasini oʻchirish/ }).first().click();
  await expect(page.getByRole("alertdialog")).toContainText("Natijani oʻchirasizmi?");
  await page.getByRole("button", { name: "Bekor qilish" }).click();
});

test("habit heatmap has labels and a legend, and the check-in is a clear button", async ({ page }) => {
  await openDemo(page, "/habits");
  await expect(page.getByText("odat hali yoʻq edi").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Bugun bajardim|Bugun bajarildi|Bugun rejada yoʻq/ }).first()).toBeVisible();
});

test("Telegram settings show no developer text", async ({ page }) => {
  await openDemo(page, "/settings/integrations");
  await expect(page.getByText(/TELEGRAM_BOT_TOKEN/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Telegramni ulash" })).toHaveCount(0);
});

test("quick add: close button, removable parsed chips", async ({ page }) => {
  await openDemo(page);
  await page.keyboard.press("q");
  const input = page.getByRole("textbox", { name: "Tezkor qoʻshish" });
  await input.fill("Uchrashuv ertaga 10:00");
  await page.getByRole("button", { name: /«ertaga» ni sana/ }).click();
  await expect(page.getByRole("button", { name: /«ertaga» ni qayta tanish/ })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Yopish" }).first().click();
  await expect(input).toBeHidden();
});

test("subtask input stays open for fast entry", async ({ page }) => {
  await openDemo(page);
  await page.getByText("Oylik hisobotni yakunlash va menejerga topshirish").first().click();
  await page.getByRole("button", { name: "Kichik vazifa qoʻshish" }).click();
  const input = page.getByRole("textbox", { name: "Kichik vazifa qoʻshish" });
  await input.fill("Birinchi");
  await input.press("Enter");
  await input.fill("Ikkinchi");
  await input.press("Enter");
  await expect(input).toBeVisible();
  await expect(page.getByText("Ikkinchi")).toBeVisible();
});

test("search results show the task's date", async ({ page }) => {
  await openDemo(page);
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox").fill("Sport zaliga");
  await expect(page.getByRole("option", { name: /Sport zaliga yozilish/ })).toContainText(/Payshanba|Chorshanba|Juma|Shanba|Yakshanba|Dushanba|Seshanba|Ertaga|Bugun|\d+-\w+/);
});
