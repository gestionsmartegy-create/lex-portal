import { serviceClient } from "../integration/helpers";
import { createStaffSession, expect, expectAccessible, signInWithMfa, test, testIp } from "./fixtures";

/**
 * Contrats, lot 3 (ADR 0036) : relecture par un·e adjoint·e (commentaire), validation par l'avocat
 * (PDF officiel), envoi, relance pas avant un jour, PDF côté client, refus, nouvelle version.
 */
test("contrat : relecture, validation et PDF, envoi, refus, nouvelle version", async ({
  browser,
  context,
  baseURL,
  client,
}) => {
  test.setTimeout(240_000);
  const admin = serviceClient();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const lawyer = await createStaffSession(context, baseURL!, "staff");
  const assistantContext = await browser.newContext({ baseURL });
  const assistant = await createStaffSession(assistantContext, baseURL!, "staff");
  const { data: matter } = await admin
    .from("matters")
    .insert({ display_number: `E2E-L3-${stamp}`, title: "Dossier lot 3", status: "open", is_mock: true })
    .select("id")
    .single();
  await admin.from("matter_team").insert([
    { matter_id: matter!.id, user_id: lawyer.id, role: "responsible" },
    { matter_id: matter!.id, user_id: assistant.id, role: "assistant" },
  ]);
  await admin
    .from("matter_access")
    .insert({ matter_id: matter!.id, user_id: client.id, access_level: "read", granted_by: lawyer.id });
  const title = `Mandat ${stamp}`;
  const { data: contract } = await admin
    .from("contracts")
    .insert({
      title,
      language: "fr",
      matter_id: matter!.id,
      client_id: client.id,
      client_name: "Avery Démo",
      client_email: client.email,
      created_by: lawyer.id,
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
  const ids = [contract!.id];
  const page = await context.newPage();
  await page.setExtraHTTPHeaders({ "x-forwarded-for": testIp() });
  const helper = await assistantContext.newPage();
  await helper.setExtraHTTPHeaders({ "x-forwarded-for": testIp() });
  const clientContext = await browser.newContext({ baseURL });
  const clientPage = await clientContext.newPage();
  await clientPage.setExtraHTTPHeaders({ "x-forwarded-for": testIp() });

  try {
    // L'avocat ouvre le contrat (il tient le verrou).
    await page.goto(`/fr/admin/contracts/${contract!.id}`);
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible({ timeout: 15_000 });

    // L'adjoint·e relit : commentaire sur la section, pas de bouton « Valider ».
    await helper.goto(`/fr/admin/contracts/${contract!.id}`);
    await expect(helper.getByRole("heading", { name: title, level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(helper.getByRole("button", { name: "Valider le contrat" })).toHaveCount(0);
    await helper.getByLabel("Sur").selectOption({ label: "1. Objet" });
    await helper.getByLabel("Commentaire", { exact: true }).fill("Préciser la durée du mandat.");
    await helper.getByRole("button", { name: "Ajouter le commentaire" }).click();
    await expect(helper.getByText("Commentaire ajouté.")).toBeVisible({ timeout: 15_000 });

    // L'avocat voit le commentaire, le règle, puis valide.
    await page.reload();
    await expect(page.getByText("Préciser la durée du mandat.")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Marquer réglé" }).click();
    await expect(page.getByText("Aucun commentaire ouvert.")).toBeVisible({ timeout: 15_000 });
    await expectAccessible(page);
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Valider le contrat" }).click();
    await expect(page.getByRole("heading", { name: "Contrat validé" })).toBeVisible({ timeout: 30_000 });
    const pdf = await page.request.get(`/api/contracts/${contract!.id}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");

    // Envoi ; la relance n'est pas possible le jour même.
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Envoyer au client" }).click();
    await expect(page.getByText("Suivi de l'envoi")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Relancer le client" })).toBeDisabled();
    await expectAccessible(page);

    // Le client télécharge le PDF officiel, puis refuse avec un motif.
    await signInWithMfa(clientPage, client.email, client.password);
    await clientPage.goto(`/fr/portal/contracts/${contract!.id}`);
    await expect(clientPage.getByRole("link", { name: "Télécharger le PDF" })).toBeVisible({
      timeout: 15_000,
    });
    const clientPdf = await clientPage.request.get(`/api/contracts/${contract!.id}/pdf`);
    expect(clientPdf.status()).toBe(200);
    await clientPage.getByText("Je ne souhaite pas accepter ce contrat").click();
    await clientPage.getByLabel("Motif (facultatif)").fill("Le tarif ne me convient pas.");
    await clientPage.getByRole("button", { name: "Refuser le contrat" }).click();
    await expect(clientPage.getByText("Votre refus est enregistré.", { exact: false })).toBeVisible({
      timeout: 15_000,
    });
    await expectAccessible(clientPage);

    // L'avocat voit le refus et crée une nouvelle version ; l'ancienne quitte le portail.
    await page.reload();
    await expect(page.getByText(/Refusé par le client le/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Motif : Le tarif ne me convient pas.")).toBeVisible();
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Modifier (nouvelle version)" }).click();
    await expect(page.getByText("Ce contrat remplace une version précédente.")).toBeVisible({
      timeout: 15_000,
    });
    ids.push(page.url().split("/").pop()!);
    await clientPage.goto("/fr/portal/contracts");
    await expect(clientPage.getByText("Aucun contrat pour l'instant.")).toBeVisible({ timeout: 15_000 });
  } finally {
    await clientContext.close();
    await assistantContext.close();
    await admin.from("notifications").delete().eq("user_id", client.id);
    await admin.from("contract_comments").delete().in("contract_id", ids);
    // Les contrats remplacés se référencent : on coupe le lien avant de supprimer.
    await admin.from("contracts").update({ superseded_by: null }).in("id", ids);
    await admin.from("contracts").update({ previous_id: null }).in("id", ids);
    await admin.from("contract_versions").delete().in("contract_id", ids);
    await admin.from("contract_sections").delete().in("contract_id", ids);
    await admin.from("contracts").delete().in("id", ids);
    await admin.from("matter_access").delete().eq("matter_id", matter!.id);
    await admin.from("matter_team").delete().eq("matter_id", matter!.id);
    await admin.from("matters").delete().eq("id", matter!.id);
    await assistant.cleanup();
    await lawyer.cleanup();
  }
});
