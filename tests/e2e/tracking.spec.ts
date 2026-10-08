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
      await page.goto(`/en/admin/matters/${MATTER}?tab=steps`);
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
      const res = await page.goto(`/en/admin/matters/${MATTER}`);
      expect(res?.status()).toBe(404);

      await serviceClient()
        .from("matter_team")
        .insert({ matter_id: MATTER, user_id: staff.id, role: "collaborator" });
      await page.goto(`/en/admin/matters/${MATTER}?tab=team`);
      await expect(page.getByRole("heading", { level: 2, name: "Firm team" })).toBeVisible();
      await expect(page.getByText("Only the firm administrator can change the team.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Add to the team" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Grant access" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Revoke" })).toHaveCount(0);
      await expect(
        page.getByText("Only the firm administrator can grant or revoke client access."),
      ).toBeVisible();
      // Ancienne adresse : redirige vers l'onglet « Équipe et accès ».
      await page.goto(`/en/admin/matters/${MATTER}/access`);
      await expect(page).toHaveURL(new RegExp(`/en/admin/matters/${MATTER}\\?tab=team`));
      await expectAccessible(page);
    } finally {
      await serviceClient().from("matter_team").delete().eq("matter_id", MATTER).eq("user_id", staff.id);
      await staff.cleanup();
    }
  });
});

test.describe("espace « Dossier » unifié", () => {
  test("vue d'ensemble, livrable, document reçu lié à une demande", async ({ page, context, baseURL }) => {
    test.setTimeout(150_000);
    const staff = await createStaffSession(context, baseURL!, "firm_admin");
    const admin = serviceClient();
    const title = `Livrable e2e ${Date.now()}`;
    // Demande du seed « Proof of funds » (en attente) sur le dossier 142, pour le lien de document.
    const { data: request } = await admin
      .from("document_requests")
      .select("id")
      .eq("matter_id", MATTER)
      .eq("title", "Proof of funds")
      .single();
    try {
      await page.goto(`/en/admin/matters/${MATTER}`);
      await expect(page.getByText("Documents pending")).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "Next steps" })).toBeVisible();
      await expectAccessible(page);

      await page.goto(`/en/admin/matters/${MATTER}?tab=steps`);
      await page.locator("#deliverable-title").fill(title);
      await page.getByRole("button", { name: "Add the deliverable" }).click();
      await expect(page.getByText("Deliverable added.")).toBeVisible({ timeout: 15_000 });
      await expect(page).toHaveURL(/tab=steps/);
      const row = page.getByRole("listitem").filter({ hasText: title });
      await row.getByLabel(`Status of ${title}`).selectOption("delivered");
      await row.getByRole("button", { name: "Update" }).click();
      await expect(page.getByText("Deliverable updated.")).toBeVisible({ timeout: 15_000 });
      await expectAccessible(page);

      await page.goto(`/en/admin/matters/${MATTER}?tab=documents`);
      await page.locator(`#link-${request!.id}`).selectOption({ label: "IRCC Form IMM 5444.pdf" });
      await page
        .getByRole("listitem")
        .filter({ has: page.locator(`#link-${request!.id}`) })
        .getByRole("button", { name: "Link and mark received" })
        .click();
      await expect(page.getByText("Document linked: the request is marked received.")).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        page.getByRole("link", { name: "Received document: IRCC Form IMM 5444.pdf" }),
      ).toBeVisible();
      await expectAccessible(page);
    } finally {
      await admin.from("matter_deliverables").delete().like("title", "Livrable e2e %");
      await admin
        .from("document_requests")
        .update({ status: "pending", fulfilled_document_id: null })
        .eq("id", request!.id);
      await staff.cleanup();
    }
  });
});
