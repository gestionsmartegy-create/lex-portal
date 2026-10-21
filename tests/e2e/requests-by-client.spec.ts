import { serviceClient } from "../integration/helpers";
import { createStaffSession, expect, expectAccessible, test } from "./fixtures";

/** Demandes de documents par client (2026-10-20) : liste des clients, bouton « Demander un document ». */
test("demande de document : liste des clients et demande ciblée", async ({
  page,
  context,
  baseURL,
  client,
}) => {
  test.setTimeout(150_000);
  const admin = serviceClient();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const staff = await createStaffSession(context, baseURL!, "staff");
  const { data: matter } = await admin
    .from("matters")
    .insert({
      display_number: `E2E-RQ-${stamp}`,
      title: "Dossier demande client",
      status: "open",
      is_mock: true,
    })
    .select("id")
    .single();
  await admin.from("matter_team").insert({ matter_id: matter!.id, user_id: staff.id, role: "responsible" });
  await admin
    .from("matter_access")
    .insert({ matter_id: matter!.id, user_id: client.id, access_level: "read", granted_by: staff.id });
  const docTitle = `Passeport ${stamp}`;
  try {
    // Onglet « Clients » par défaut, avec le client et son dossier.
    await page.goto(`/fr/admin/requests?who=${encodeURIComponent(client.email)}`);
    await expect(page.getByRole("link", { name: "Clients", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const row = page.locator("li", { hasText: client.email });
    await expect(row).toContainText(`E2E-RQ-${stamp}`);
    await expect(row).toContainText("Aucune demande en cours");
    await expectAccessible(page);

    // Bouton du client : formulaire déjà rempli pour lui, dossier unique déjà choisi.
    await row.getByRole("link", { name: /Demander un document à/ }).click();
    await expect(page.getByRole("heading", { name: "Demander un document", level: 1 })).toBeVisible();
    await expect(page.getByText(client.email)).toBeVisible();
    await expect(page.getByRole("radio", { name: new RegExp(`E2E-RQ-${stamp}`) })).toBeChecked();
    await page.getByLabel("Document demandé").fill(docTitle);
    await expectAccessible(page);
    await page.getByRole("button", { name: "Envoyer la demande" }).click();
    await expect(page.getByText("Demande envoyée. Le client a été averti.")).toBeVisible({ timeout: 15_000 });

    const { data: created } = await admin
      .from("document_requests")
      .select("requested_from, matter_id, status")
      .eq("title", docTitle)
      .single();
    expect(created).toEqual({ requested_from: client.id, matter_id: matter!.id, status: "pending" });
    await page.goto(`/fr/admin/requests?who=${encodeURIComponent(client.email)}`);
    await expect(page.locator("li", { hasText: client.email })).toContainText("1 en attente");

    // Bouton en haut de la section : choix du client dans une liste.
    await page.getByRole("link", { name: "Demander un document", exact: true }).first().click();
    await page.getByLabel("Client", { exact: true }).selectOption(client.id);
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByText(client.email)).toBeVisible();

    // L'onglet « Toutes les demandes » garde la liste existante.
    await page.goto("/fr/admin/requests?view=all");
    await expect(page.getByLabel("Recherche (document ou dossier)")).toBeVisible();
  } finally {
    await admin.from("notifications").delete().eq("user_id", client.id);
    await admin.from("document_requests").delete().eq("matter_id", matter!.id);
    await admin.from("matter_access").delete().eq("matter_id", matter!.id);
    await admin.from("matter_team").delete().eq("matter_id", matter!.id);
    await admin.from("matters").delete().eq("id", matter!.id);
    await staff.cleanup();
  }
});
