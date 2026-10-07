import { serviceClient } from "../integration/helpers";
import { createStaffSession, expect, expectAccessible, signInWithMfa, test, testIp } from "./fixtures";

/** Suivi du dossier (ADR 0018) : étapes gérées par le cabinet, client averti, équipe gérée par le firm_admin. */
const MATTER = "c0000000-0000-4000-8000-000000000142";

test.describe("suivi du dossier", () => {
  test("le cabinet ajoute, termine, réordonne et supprime une étape ; le client voit et est averti", async ({
    browser,
    page,
    context,
    baseURL,
    client,
  }) => {
    test.setTimeout(180_000);
    const staff = await createStaffSession(context, baseURL!, "firm_admin");
    const title = `Étape e2e ${Date.now()}`;
    try {
      await page.goto(`/en/admin/matters/${MATTER}/tracking`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.locator("#new-step-title").fill(title);
      await page.locator("#new-step-description").fill("Visible to the client.");
      await page.getByRole("button", { name: "Add the step" }).click();
      await expect(page.getByText("Step added.")).toBeVisible();
      const row = page.getByRole("listitem").filter({ hasText: title });
      await expect(row).toBeVisible();
      await expectAccessible(page);

      await row.getByRole("button", { name: "Mark as done" }).click();
      await expect(page.getByText("Step marked as done: the client has been notified.")).toBeVisible();
      await page
        .getByRole("listitem")
        .filter({ hasText: title })
        .getByRole("button", { name: `Move up: ${title}` })
        .click();
      await expect(page.getByText("Order updated.")).toBeVisible();

      // Côté client : la nouvelle étape est dans la chronologie, et la notification est arrivée.
      const clientContext = await browser.newContext({ baseURL });
      const clientPage = await clientContext.newPage();
      await clientPage.setExtraHTTPHeaders({ "x-forwarded-for": testIp() });
      await signInWithMfa(clientPage, client.email, client.password);
      await clientPage.goto(`/en/portal/matters/${MATTER}?tab=timeline`);
      await expect(clientPage.getByText(title)).toBeVisible();
      await clientPage.goto("/en/portal/notifications");
      await expect(clientPage.getByText("Step completed").first()).toBeVisible();
      await clientContext.close();

      await page
        .getByRole("listitem")
        .filter({ hasText: title })
        .getByRole("button", { name: `Delete: ${title}` })
        .click();
      await expect(page.getByText("Step deleted.")).toBeVisible();
      await expect(page.getByRole("listitem").filter({ hasText: title })).toHaveCount(0);
    } finally {
      await serviceClient().from("matter_timeline_steps").delete().like("title", "Étape e2e %");
      await staff.cleanup();
    }
  });

  test("équipe : un avocat hors équipe reçoit 404, puis accède une fois ajouté (sans pouvoir gérer l'équipe)", async ({
    page,
    context,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const staff = await createStaffSession(context, baseURL!, "staff");
    try {
      const res = await page.goto(`/en/admin/matters/${MATTER}/tracking`);
      expect(res?.status()).toBe(404);

      await serviceClient()
        .from("matter_team")
        .insert({ matter_id: MATTER, user_id: staff.id, role: "collaborator" });
      await page.goto(`/en/admin/matters/${MATTER}/tracking`);
      await expect(page.getByRole("heading", { level: 2, name: "Firm team" })).toBeVisible();
      await expect(page.getByText("Only the firm administrator can change the team.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Add to the team" })).toHaveCount(0);
      await expectAccessible(page);
    } finally {
      await serviceClient().from("matter_team").delete().eq("matter_id", MATTER).eq("user_id", staff.id);
      await staff.cleanup();
    }
  });
});
