import { serviceClient } from "../integration/helpers";
import { createStaffSession, expect, expectAccessible, signInWithMfa, test, testIp } from "./fixtures";

/**
 * Portail client (ADR 0035) : le cabinet envoie un contrat, le client le voit dans « Ce que vous devez
 * faire », le lit et l'accepte ; une date de cour rendue visible avertit le client.
 */
test("contrat envoyé au client, accepté dans le portail ; avis de date de cour", async ({
  browser,
  context,
  baseURL,
  client,
}) => {
  test.setTimeout(240_000);
  const admin = serviceClient();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const staff = await createStaffSession(context, baseURL!, "staff");
  const { data: matter } = await admin
    .from("matters")
    .insert({
      display_number: `E2E-CC-${stamp}`,
      title: "Dossier contrat client",
      status: "open",
      is_mock: true,
    })
    .select("id")
    .single();
  await admin.from("matter_team").insert({ matter_id: matter!.id, user_id: staff.id, role: "responsible" });
  await admin
    .from("matter_access")
    .insert({ matter_id: matter!.id, user_id: client.id, access_level: "read", granted_by: staff.id });
  const title = `Conditions ${stamp}`;
  const { data: contract } = await admin
    .from("contracts")
    .insert({
      title,
      language: "fr",
      matter_id: matter!.id,
      client_id: client.id,
      client_name: "Avery Démo",
      client_email: client.email,
      created_by: staff.id,
    })
    .select("id")
    .single();
  await admin.from("contract_sections").insert({
    contract_id: contract!.id,
    position: 0,
    title: "Objet",
    body: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: `Texte ${stamp}.` }] }],
    },
  });
  const staffPage = await context.newPage();
  await staffPage.setExtraHTTPHeaders({ "x-forwarded-for": testIp() });
  const clientContext = await browser.newContext({ baseURL });
  const page = await clientContext.newPage();
  await page.setExtraHTTPHeaders({ "x-forwarded-for": testIp() });

  try {
    // Cabinet : envoi (version figée), suivi.
    await staffPage.goto(`/fr/admin/contracts/${contract!.id}`);
    await expect(staffPage.getByRole("heading", { name: title, level: 1 })).toBeVisible({ timeout: 15_000 });
    // Lot 3 : un avocat de l'équipe valide d'abord (version figée, PDF officiel), puis on envoie.
    staffPage.once("dialog", (d) => void d.accept());
    await staffPage.getByRole("button", { name: "Valider le contrat" }).click();
    await expect(staffPage.getByRole("heading", { name: "Contrat validé" })).toBeVisible({ timeout: 30_000 });
    await expect(staffPage.getByText(/Empreinte \(SHA-256\)/)).toBeVisible();
    staffPage.once("dialog", (d) => void d.accept());
    await staffPage.getByRole("button", { name: "Envoyer au client" }).click();
    await expect(staffPage.getByText("Suivi de l'envoi")).toBeVisible({ timeout: 15_000 });
    await expect(staffPage.getByText("Pas encore consulté par le client.")).toBeVisible();
    // Sans recharger : plus rien n'est modifiable après l'envoi.
    await expect(staffPage.getByRole("button", { name: "Envoyer au client" })).toHaveCount(0);
    const { data: sent } = await admin
      .from("contracts")
      .select("status, sent_version")
      .eq("id", contract!.id)
      .single();
    expect(sent).toEqual({ status: "sent", sent_version: 1 });
    const { count: notes } = await admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", client.id)
      .eq("type", "contract_sent");
    expect(notes).toBe(1);

    // Client : à faire, lecture, acceptation.
    await signInWithMfa(page, client.email, client.password);
    await expect(page.getByText(`Accept: ${title}`)).toBeVisible({ timeout: 15_000 });
    await page.goto("/fr/portal/contracts");
    await expect(page.getByRole("heading", { name: "Mes contrats", level: 1 })).toBeVisible();
    await expect(page.getByText("À accepter")).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("link", { name: title }).click();
    await expect(page.getByText(`Texte ${stamp}.`)).toBeVisible({ timeout: 15_000 });
    await expectAccessible(page);
    await page.getByLabel("Votre nom complet").fill("Avery Démo");
    await page.getByLabel("J'ai lu ce contrat et je l'accepte.").check();
    await page.getByRole("button", { name: "Accepter le contrat" }).click();
    await expect(page.getByText("Merci, votre acceptation est enregistrée.")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Accepté par Avery Démo/)).toBeVisible();

    await staffPage.reload();
    await expect(staffPage.getByText(/Accepté par Avery Démo/)).toBeVisible({ timeout: 15_000 });
    await expect(staffPage.getByText(/Consulté par le client le/)).toBeVisible();

    // Un autre contrat (pas le sien) : même 404.
    const res = await page.goto(`/fr/portal/contracts/${crypto.randomUUID()}`);
    expect(res?.status()).toBe(404);

    // Date de cour rendue visible : avis au client.
    await staffPage.goto(`/en/admin/matters/${matter!.id}?tab=court`);
    await staffPage.getByText("Add a court date").click();
    const form = staffPage.locator("form", { has: staffPage.locator("#n-kind") });
    await form.getByLabel("Type").selectOption("hearing");
    await form.getByLabel("Start (court time)").fill("2026-12-15T09:30");
    await form.getByLabel(/Show this date to the client/).check();
    await form.getByRole("button", { name: "Add", exact: true }).click();
    await expect(staffPage.getByText("Court date saved.")).toBeVisible({ timeout: 15_000 });
    const { count: courtNotes } = await admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", client.id)
      .eq("type", "court_date_changed");
    expect(courtNotes).toBe(1);
    await page.goto("/en/portal/notifications");
    await expect(page.getByText("New court date")).toBeVisible({ timeout: 15_000 });
  } finally {
    await clientContext.close();
    await staffPage.close();
    await admin.from("notifications").delete().eq("user_id", client.id);
    await admin.from("court_dates").delete().eq("matter_id", matter!.id);
    await admin.from("contract_versions").delete().eq("contract_id", contract!.id);
    await admin.from("contract_sections").delete().eq("contract_id", contract!.id);
    await admin.from("contracts").delete().eq("id", contract!.id);
    await admin.from("matter_access").delete().eq("matter_id", matter!.id);
    await admin.from("matter_team").delete().eq("matter_id", matter!.id);
    await admin.from("matters").delete().eq("id", matter!.id);
    await staff.cleanup();
  }
});
