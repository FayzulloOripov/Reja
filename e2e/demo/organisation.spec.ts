import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { openDemo, REAL } from "./helpers";

// Phase 5: waiting-for, contacts, meetings, weekly review, daily shutdown, routines —
// in the demo and (E2E_BACKEND=real) against Supabase.

test.use({ viewport: { width: 1280, height: 860 } });

const sb = () =>
  createClient((process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/rest\/v1\/?$/, ""), (process.env.SUPABASE_SECRET_KEY ?? "").trim(), {
    auth: { persistSession: false },
  });

/** Before a reload: let the snapshot (demo) or the outbox (real backend) write the change. */
async function settled(page: Page) {
  await page.waitForTimeout(REAL ? 1200 : 700);
}

test("waiting-for: mark a task as waiting on a contact, see it on /waiting with days and follow-up", async ({ page }) => {
  await openDemo(page);
  // a task in the team workspace (contacts belong to a workspace)
  await page.getByText("Avgust tushumi farqini solishtirish").first().click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("button", { name: "Kimdandir kutyapman…" }).click();
  await page.getByPlaceholder("Ism yoki kontakt…").fill("Dilnoza");
  await page.getByRole("option", { name: /Dilnoza \(demo\)/ }).click();
  await expect(panel.getByRole("button", { name: /Dilnoza \(demo\).*bugundan/ })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Eslatish sanasi" })).toBeVisible();
  await page.keyboard.press("Escape");
  await settled(page);

  await page.goto("/waiting");
  const mine = page.locator("section", { has: page.getByRole("heading", { name: /Men kutayotganlar/ }) });
  await expect(mine).toContainText("Dilnoza (demo)");
  await expect(mine).toContainText("Avgust tushumi farqini solishtirish");
  // the seeded task waiting on TexnoSoft's CTO is due a follow-up today
  await expect(mine).toContainText("Akmal Rahimov (demo)");
  await expect(mine.getByText(/tasini soʻrash vaqti/)).toBeVisible();
  await expect(page.locator("[data-task-id]", { hasText: "TexnoSoft dan CRM narxini olish" })).toContainText("Akmal Rahimov (demo) · 4 kun");

  if (REAL) {
    const { data } = await sb().from("tasks").select("status, waiting_on_contact_id, follow_up_date").eq("title", "Avgust tushumi farqini solishtirish").order("updated_at", { ascending: false }).limit(1).single();
    expect(data).toMatchObject({ status: "waiting" });
    expect(data!.waiting_on_contact_id).toBeTruthy();
    expect(data!.follow_up_date).toBeTruthy();
  }
});

test("contacts: add one, then it can be picked", async ({ page }) => {
  await openDemo(page, "/contacts");
  await expect(page.getByRole("heading", { name: "Akmal Rahimov (demo)" })).toBeVisible();
  await page.getByRole("button", { name: "Yangi kontakt" }).click();
  await page.getByLabel("Nomi").fill("Sardor (demo)");
  await page.getByLabel("Kompaniya").fill("Logistika (demo)");
  await page.getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByRole("heading", { name: "Sardor (demo)" })).toBeVisible();
  await settled(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sardor (demo)" })).toBeVisible();
});

test("meetings: decision becomes a task; finishing carries open points to next week", async ({ page }) => {
  await openDemo(page, "/meetings");
  await page.getByRole("link", { name: /Haftalik hamkor uchrashuvi/ }).first().click();
  await expect(page.getByRole("heading", { name: "Kun tartibi" })).toBeVisible();
  // tick one agenda point, add a decision and turn it into a task
  await page.getByRole("checkbox", { name: "Masala: Oʻtgan hafta raqamlari" }).click();
  await page.getByRole("textbox", { name: "Qaror qoʻshish" }).fill("Saytni dushanbagacha yangilash");
  await page.getByRole("textbox", { name: "Qaror qoʻshish" }).press("Enter");
  await page.locator("li", { hasText: "Saytni dushanbagacha yangilash" }).getByRole("button", { name: "Vazifaga" }).click();
  await expect(page.locator("li", { hasText: "Saytni dushanbagacha yangilash" }).getByRole("button", { name: "Vazifa" })).toBeVisible();
  await page.getByRole("button", { name: "Uchrashuvni yakunlash" }).click();
  await page.locator("[data-sonner-toast]", { hasText: "Keyingi uchrashuv" }).getByRole("button", { name: "Ochish" }).click();
  // the next meeting a week later holds the two points nobody got to
  await expect(page.getByRole("checkbox", { name: "Masala: CRM: TexnoSoft javobi" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Masala: Keyingi hafta rejasi va masʼullar" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Masala: Oʻtgan hafta raqamlari" })).toHaveCount(0);
  await settled(page);

  await page.goto("/inbox");
  await expect(page.getByText("Saytni dushanbagacha yangilash")).toBeVisible();
  if (REAL) {
    const { data } = await sb().from("meeting_items").select("text, task_id").eq("text", "Saytni dushanbagacha yangilash").single();
    expect(data!.task_id).toBeTruthy();
  }
});

test("meetings: the weekly partner meeting template fills Friday 19:30 and the agenda", async ({ page }) => {
  await openDemo(page, "/meetings");
  // delete the seeded series' next meeting so the template card shows
  await page.getByRole("link", { name: /Haftalik hamkor uchrashuvi/ }).first().click();
  await page.getByRole("button", { name: "Yana" }).click();
  await page.getByRole("menuitem", { name: "Oʻchirish" }).click();
  await expect(page).toHaveURL(/\/meetings$/);
  await page.getByRole("button", { name: /Haftalik hamkor uchrashuvi Har juma 19:30/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Vaqt")).toHaveValue("19:30");
  await dialog.getByRole("button", { name: "Yaratish" }).click();
  await expect(page.getByRole("checkbox", { name: /Masala: Oʻtgan hafta: \d+ ta bajarildi/ })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Masala: Pul: tushum va xarajatlar" })).toBeVisible();
  await expect(page.getByText("Takrorlanadi")).toBeVisible();
});

test("weekly review: six steps, saved, shows in history", async ({ page }) => {
  await openDemo(page, "/review");
  await expect(page.getByRole("heading", { name: "Kiruvchini tozalang" })).toBeVisible();
  for (const next of ["Hafta raqamlarda", "Kechikkanlar", "Kutilayotganlar", "Keyingi hafta", "Xulosa"]) {
    await page.getByRole("button", { name: "Keyingi" }).click();
    await expect(page.getByRole("heading", { name: next })).toBeVisible();
  }
  await page.getByLabel("Yutuqlar").fill("Hamkor uchrashuvi oʻz vaqtida");
  await page.getByRole("button", { name: "Tahlilni yakunlash" }).click();
  await expect(page.getByText("Bu haftaning tahlili tugallangan")).toBeVisible();
  await settled(page);
  await page.reload();
  await expect(page.getByText("Bu haftaning tahlili tugallangan")).toBeVisible();
  const history = page.locator("section", { has: page.getByRole("heading", { name: "Oʻtgan tahlillar" }) });
  await expect(history.locator("details")).toHaveCount(2);
});

test("daily shutdown: move what's left to tomorrow and close the day", async ({ page }) => {
  await openDemo(page, "/shutdown");
  await page.getByRole("button", { name: /tasini ertaga koʻchirish/ }).click();
  await expect(page.getByText("Bugungi rejadan hech narsa qolmadi")).toBeVisible();
  await page.getByRole("textbox", { name: "Ertangi oʻzingizga eslatma" }).fill("CRM dan boshlash");
  await page.getByRole("button", { name: "Kunni yakunlash" }).click();
  await expect(page.getByText("Kun yakunlandi")).toBeVisible();
  await settled(page);
  await page.reload();
  await expect(page.getByText("Kun yakunlandi")).toBeVisible();
});

test("routines: create a daily routine, tick it off, it stays ticked", async ({ page }) => {
  await openDemo(page, "/routines");
  await page.getByRole("button", { name: "Yangi rutin" }).first().click();
  await page.getByLabel("Nomi").fill("Kechki tartib");
  await page.getByLabel("Qadamlar (har biri yangi qatorda)").fill("Stolni yigʻish\nErtangi kiyim");
  await page.getByRole("button", { name: "Yaratish" }).click();
  const card = page.getByRole("article", { name: "Kechki tartib" });
  await card.getByText("Stolni yigʻish").click();
  await card.getByText("Ertangi kiyim").click();
  await expect(card.getByText("Bugun bajarildi")).toBeVisible();
  await settled(page);
  await page.reload();
  await expect(page.getByRole("article", { name: "Kechki tartib" }).getByText("Bugun bajarildi")).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Kechki tartib/ })).toContainText("2/2");
});

test("settings: the close-the-day push can be switched on", async ({ page }) => {
  await openDemo(page, "/settings/notifications");
  const toggle = page.getByRole("switch", { name: "Kunni yakunlash" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("Kunni yakunlash vaqti")).toBeEnabled();
});
