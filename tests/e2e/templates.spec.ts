import { serviceClient } from "../integration/helpers";
import { createStaffSession, expect, expectAccessible, signInWithMfa, test, testIp } from "./fixtures";

/** Modèles de dossiers (ADR 0019) : type, étapes types, champs, demandes de documents. */
/** Chaque exécution (bureau, mobile) a son propre dossier fictif : aucun conflit en parallèle. */
async function createMatter() {
  const { data } = await serviceClient()
    .from("matters")
    .insert({
      display_number: `E2E-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: "Dossier e2e (modèles)",
      status: "open",
      is_mock: true,
    })
    .select("id")
    .single();
  return data!.id as string;
}

async function removeMatter(matterId: string) {
  const admin = serviceClient();
  await admin.from("document_requests").delete().eq("matter_id", matterId);
  await admin.from("matter_access").delete().eq("matter_id", matterId);
  await admin.from("matter_team").delete().eq("matter_id", matterId);
  await admin.from("notifications").delete().eq("matter_id", matterId);
  await admin.from("matters").delete().eq("id", matterId);
}

test.describe("modèles de dossiers", () => {
  test("type, étapes du modèle, informations et demande de document : le client voit et est averti", async ({
    browser,
    page,
    context,
    baseURL,
    client,
  }) => {
    test.setTimeout(180_000);
    const staff = await createStaffSession(context, baseURL!, "firm_admin");
    const MATTER = await createMatter();
    await serviceClient().from("matter_access").insert({
      matter_id: MATTER,
      user_id: client.id,
      access_level: "read",
      granted_by: staff.id,
    });
    try {
      await page.goto(`/en/admin/matters/${MATTER}?tab=details`);
      await page
        .getByLabel("Matter type")
        .selectOption({ label: "Immigration — Permanent Residence (Express Entry, PNP)" });
      await page.getByRole("button", { name: "Save the type" }).click();
      await expect(page.getByText("Matter type saved.")).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: "Add the template steps" }).click();
      await expect(page.getByText("Template steps added.")).toBeVisible({ timeout: 15_000 });
      await page.goto(`/en/admin/matters/${MATTER}?tab=steps`);
      await expect(page.getByRole("listitem").filter({ hasText: "Invitation to apply" })).toBeVisible();
      await page.goto(`/en/admin/matters/${MATTER}?tab=details`);

      await page.getByLabel("Unique client identifier (UCI)").fill("UCI-E2E-42");
      await page.getByRole("button", { name: "Save the details" }).click();
      await expect(page.getByText("Matter details saved.")).toBeVisible({ timeout: 15_000 });

      await page.goto(`/en/admin/matters/${MATTER}?tab=documents`);
      await page
        .getByLabel("Document from the template")
        .selectOption({ label: "Valid passport (all pages)" });
      await page.getByRole("button", { name: "Request the document" }).click();
      await expect(page.getByText("Document requested: the client has been notified.")).toBeVisible({
        timeout: 15_000,
      });
      await expectAccessible(page);

      // Côté client : notification, pièce demandée, informations visibles, étapes en anglais.
      const clientContext = await browser.newContext({ baseURL });
      const clientPage = await clientContext.newPage();
      await clientPage.setExtraHTTPHeaders({ "x-forwarded-for": testIp() });
      await signInWithMfa(clientPage, client.email, client.password);
      await clientPage.goto("/en/portal/notifications");
      await expect(clientPage.getByText("Document requested").first()).toBeVisible();
      await clientPage.goto("/en/portal/documents");
      await expect(clientPage.getByText("Valid passport (all pages)")).toBeVisible();
      await clientPage.goto(`/en/portal/matters/${MATTER}`);
      await expect(clientPage.getByText("UCI-E2E-42")).toBeVisible();
      await clientPage.goto(`/en/portal/matters/${MATTER}?tab=timeline`);
      await expect(clientPage.getByText("Invitation to apply", { exact: true })).toBeVisible();
      await clientContext.close();

      await page.getByRole("button", { name: "Mark received: Valid passport (all pages)" }).click();
      await expect(page.getByText("Request updated.")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Received", { exact: true })).toBeVisible();
    } finally {
      await removeMatter(MATTER);
      await staff.cleanup();
    }
  });

  test("modèles : le firm_admin ajoute une étape type ; le personnel reçoit 404", async ({
    page,
    context,
    baseURL,
    browser,
  }) => {
    test.setTimeout(120_000);
    const admin = await createStaffSession(context, baseURL!, "firm_admin");
    const title = `Étape modèle e2e ${Date.now()}`;
    try {
      await page.goto("/en/admin/templates");
      await expect(page.getByRole("heading", { level: 1, name: "Matter templates" })).toBeVisible();
      await page.getByRole("link", { name: "Edit: Notarial Services" }).click();
      await page.locator("#new-steps-fr").fill(title);
      await page.locator("#new-steps-en").fill(`${title} (EN)`);
      await page.getByRole("button", { name: "Add the step" }).click();
      await expect(page.getByText("Item added.")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      await expectAccessible(page);

      const staffContext = await browser.newContext({ baseURL });
      const staff = await createStaffSession(staffContext, baseURL!, "staff");
      const staffPage = await staffContext.newPage();
      const res = await staffPage.goto("/en/admin/templates");
      expect(res?.status()).toBe(404);
      await staff.cleanup();
      await staffContext.close();
    } finally {
      await serviceClient().from("matter_type_steps").delete().like("title_fr", "Étape modèle e2e %");
      await admin.cleanup();
    }
  });
});
