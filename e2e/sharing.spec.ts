import { expect, test } from "@playwright/test";
import { admin, cleanupUser, requireSupabase, signIn, skipOnboarding, uniqueEmail } from "./helpers";

test.describe("sharing", () => {
  requireSupabase();
  const ownerEmail = uniqueEmail("owner");
  const guestEmail = uniqueEmail("guest");
  test.afterAll(async () => {
    await cleanupUser(ownerEmail);
    await cleanupUser(guestEmail);
  });

  test("a project guest sees only the shared project", async ({ browser }) => {
    const owner = await browser.newPage();
    await signIn(owner, ownerEmail);
    await skipOnboarding(owner);

    // owner creates two projects through the API under their session-less admin (fast setup)
    const sb = admin();
    const { data: me } = await sb.from("profiles").select("id, current_workspace_id").eq("email", ownerEmail).single();
    const { data: ws } = await sb.from("workspaces").insert({ name: "Agentlik", owner_id: me!.id }).select("id").single();
    const { data: shared } = await sb.from("projects").insert({ workspace_id: ws!.id, name: "Mijoz A", owner_id: me!.id }).select("id").single();
    const { data: hidden } = await sb.from("projects").insert({ workspace_id: ws!.id, name: "Ichki loyiha", owner_id: me!.id }).select("id").single();
    await sb.from("tasks").insert([
      { workspace_id: ws!.id, project_id: shared!.id, title: "Mijoz bilan qoʻngʻiroq", created_by: me!.id },
      { workspace_id: ws!.id, project_id: hidden!.id, title: "Maxfiy vazifa", created_by: me!.id },
    ]);

    // owner creates an invite link from the share dialog
    await owner.goto(`/projects/${shared!.id}`);
    await owner.getByRole("button", { name: /Ulashish/ }).click();
    await owner.getByRole("button", { name: /Havola yaratish/ }).click();
    const link = await owner.locator("code", { hasText: "/invite/" }).textContent();
    expect(link).toContain("/invite/");

    // guest accepts
    const guest = await browser.newPage();
    await signIn(guest, guestEmail);
    await skipOnboarding(guest);
    await guest.goto(new URL(link!).pathname);
    await guest.getByRole("button", { name: "Taklifni qabul qilish" }).click();
    await expect(guest).toHaveURL(new RegExp(`/projects/${shared!.id}`));
    await expect(guest.getByText("Mijoz bilan qoʻngʻiroq")).toBeVisible();

    // the other project is invisible to the guest
    await guest.goto(`/projects/${hidden!.id}`);
    await expect(guest.getByText("Sahifa topilmadi")).toBeVisible();
    await expect(guest.getByText("Maxfiy vazifa")).toHaveCount(0);
    await expect(guest.getByRole("link", { name: "Ichki loyiha" })).toHaveCount(0);
  });
});
