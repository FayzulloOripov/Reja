import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { openDemo, REAL, swipe } from "./helpers";

// Phase 4: everything in «not tested yet» — in the demo and against the real backend.

test.use({ viewport: { width: 1280, height: 860 } });

const openProject = async (page: import("@playwright/test").Page, name: RegExp, view?: string) => {
  await page.getByRole("link", { name }).first().click();
  await expect(page.getByRole("textbox", { name: "Nomi" })).toBeVisible();
  if (view) await page.getByRole("button", { name: view, exact: true }).click();
};

test("board: order within a column is kept after reload (keyboard drag)", async ({ page }) => {
  await openDemo(page);
  await openProject(page, /Sotuv boʻlimi/, "Doska");
  const column = page.locator('[data-board-column][aria-label="Rejalashtirilgan"]');
  const titles = () => column.locator("article p.flex-1").allInnerTexts();
  await expect(column.locator("article").first()).toBeVisible();
  const before = await titles();
  expect(before.length).toBeGreaterThan(1);
  // pick up the first card, move it one place down, drop it
  await column.locator("[aria-roledescription=sortable]").first().focus();
  // like a person: pick up, wait a moment, move, drop
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(300);
  await page.keyboard.press("Space");
  await expect.poll(titles).toEqual([before[1], before[0], ...before.slice(2)]);
  await page.waitForTimeout(600);
  await page.reload();
  await expect.poll(titles).toEqual([before[1], before[0], ...before.slice(2)]);
});

test("timeline: move and resize a bar, with a today marker", async ({ page }) => {
  await openDemo(page);
  await openProject(page, /Sotuv boʻlimi/, "Vaqt chizigʻi");
  await expect(page.getByText("Bugun", { exact: true }).first()).toBeVisible();
  const bar = page.getByRole("button", { name: /^CRM texnik topshirigʻini CTO ga yuborish:/ });
  const label0 = await bar.getAttribute("aria-label");
  await bar.focus();
  await page.keyboard.press("Shift+ArrowRight"); // one day longer
  await page.keyboard.press("ArrowRight"); // and one day later
  await expect(bar).not.toHaveAttribute("aria-label", label0!);
});

test("calendar: drag a task to another day; the project deadline is shown", async ({ page }) => {
  await openDemo(page);
  await openProject(page, /Agentlik mijozlari/, "Kalendar");
  await page.getByRole("radio", { name: "Oy" }).click();
  await expect(page.getByText(/Loyiha muddati: Agentlik mijozlari/).first()).toBeAttached();
  const chip = page.getByRole("button", { name: /Metod paketi rejasi/ }).first();
  const box = (await chip.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 10, box.y + 110, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Qaytarish" })).toBeVisible();
});

test("recurring: undoing a completion removes the generated next occurrence", async ({ page }) => {
  await openDemo(page, "/upcoming");
  const rows = () => page.locator("[data-task-id]", { hasText: "Har kuni 8 stakan suv" });
  await expect(rows()).toHaveCount(1);
  await rows().first().getByRole("checkbox").click();
  await expect(rows()).toHaveCount(1); // today's is done (hidden), tomorrow's appeared
  await page.getByRole("button", { name: "Qaytarish" }).click();
  await expect(rows()).toHaveCount(1);
  await expect(rows().first().getByRole("checkbox")).toHaveAttribute("aria-checked", "false");
  await expect(rows().first()).toContainText("Bugun");
});

test("task panel: estimate in hours, and typing is kept when the panel closes at once", async ({ page }) => {
  await openDemo(page);
  await page.getByText("Barcha ochiq ishlarni bir joyga yozib chiqish").first().click();
  const estimate = page.getByRole("textbox", { name: "Taxminiy vaqt" });
  await estimate.fill("1,5 soat");
  await estimate.press("Enter");
  await expect(estimate).toHaveValue("1 soat 30 daq");
  // type a new title and close immediately with Escape
  const title = page.getByRole("dialog").getByRole("textbox").first();
  await title.fill("Ochiq ishlar roʻyxati (yangi nom)");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-task-id]", { hasText: "Ochiq ishlar roʻyxati (yangi nom)" }).first()).toBeVisible();
});

test("Home day timeline shows only the hours of the user's day", async ({ page }) => {
  await openDemo(page);
  const timeline = page.getByRole("list", { name: "Kun jadvali" });
  await expect(timeline.getByText("07:00", { exact: true })).toBeVisible();
  await expect(timeline.getByText("06:00", { exact: true })).toHaveCount(0);
  await expect(timeline.getByText("rejalashtirilgan vaqt bloki").first()).toBeAttached();
});

test.describe("phone gestures", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("swipe left reschedules, with undo", async ({ page }) => {
    await openDemo(page, "/upcoming");
    const row = page.locator("[data-task-id]", { hasText: "Oktabr maqsadini menejer bilan kelishish" });
    await swipe(page, row, -300);
    await page.getByRole("button", { name: /Keyingi hafta/ }).click();
    await expect(page.getByRole("button", { name: "Qaytarish" })).toBeVisible();
    await page.getByRole("button", { name: "Qaytarish" }).click();
    await expect(page.getByRole("rowgroup").filter({ has: page.getByRole("heading", { name: /^Ertaga/ }) })).toContainText("Oktabr maqsadini menejer bilan kelishish");
  });
});

test("offline: lists stay readable and quick add syncs when back online", async ({ page, context }) => {
  test.skip(!REAL, "needs the real backend to check the sync");
  await openDemo(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload(); // let the service worker take control of the page
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Oylik hisobotni yakunlash va menejerga topshirish").first()).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("q");
  await page.getByRole("textbox", { name: "Tezkor qoʻshish" }).fill("Oflayn qoʻshilgan vazifa");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/oflayn|internet/i).first()).toBeVisible();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  const sb = createClient((process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/rest\/v1\/?$/, ""), (process.env.SUPABASE_SECRET_KEY ?? "").trim(), { auth: { persistSession: false } });
  await expect.poll(async () => (await sb.from("tasks").select("id").eq("title", "Oflayn qoʻshilgan vazifa")).data?.length ?? 0, { timeout: 30_000 }).toBe(1);
});

test("a brand-new empty account: every page shows an empty state, nothing breaks", async ({ page }) => {
  test.skip(!REAL, "needs the real backend");
  const sb = createClient((process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/rest\/v1\/?$/, ""), (process.env.SUPABASE_SECRET_KEY ?? "").trim(), { auth: { persistSession: false } });
  const email = `e2e+empty-${Date.now().toString(36)}@example.test`;
  const { data } = await sb.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: "Bo'sh" } });
  try {
    await sb.from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", data.user!.id);
    const { data: link } = await sb.auth.admin.generateLink({ type: "magiclink", email });
    await page.goto(`/auth/confirm?token_hash=${link!.properties!.hashed_token}&type=magiclink&next=/`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
    for (const path of ["/", "/inbox", "/upcoming", "/waiting", "/projects", "/overview", "/goals", "/habits", "/focus", "/reports", "/workload", "/notifications", "/settings/trash"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }), path).toBeVisible();
      await expect(page.getByText("Xatolik yuz berdi"), path).toHaveCount(0);
    }
  } finally {
    await sb.auth.admin.deleteUser(data.user!.id);
  }
});

test.describe("phone: swipe right completes", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("swipe right completes, with undo", async ({ page }) => {
    await openDemo(page, "/upcoming");
    const row = page.locator("[data-task-id]", { hasText: "Oktabr maqsadini menejer bilan kelishish" });
    await swipe(page, row, 300);
    await page.getByRole("button", { name: "Qaytarish" }).click();
    await expect(row.getByRole("checkbox")).toHaveAttribute("aria-checked", "false");
  });
});
