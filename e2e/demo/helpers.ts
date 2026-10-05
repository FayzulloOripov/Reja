import { expect, type Page } from "@playwright/test";

/** Opens the in-browser demo (fresh seed data for every test: each test has its own browser context). */
export async function openDemo(page: Page, path = "/") {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  if (path !== "/") await page.goto(path);
}

/** Buttons and links with no accessible name (icon-only controls must have aria-label). */
export async function unnamedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("button, a[href], [role=button], [role=checkbox]"))) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || el.closest("[aria-hidden=true], nextjs-portal")) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const labelledBy = el.getAttribute("aria-labelledby");
      const name =
        el.getAttribute("aria-label") ||
        (labelledBy && document.getElementById(labelledBy)?.textContent) ||
        el.textContent?.trim() ||
        el.getAttribute("title") ||
        el.querySelector("img[alt]")?.getAttribute("alt");
      if (!name?.trim()) out.push(el.outerHTML.slice(0, 160));
    }
    return out;
  });
}
