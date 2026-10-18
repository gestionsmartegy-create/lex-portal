import { serviceClient } from "../integration/helpers";
import { createStaffSession, expect, expectAccessible, test } from "./fixtures";

/** Contrats, lot 1 (ADR 0032, F1 à F3) : créer, rédiger, aide IA (simulateur), version, aperçu, verrou. */
async function removeContracts(ids: string[]) {
  const admin = serviceClient();
  if (!ids.length) return;
  await admin.from("contract_versions").delete().in("contract_id", ids);
  await admin.from("contract_sections").delete().in("contract_id", ids);
  await admin.from("contracts").delete().in("id", ids);
}

test("contrats : créer pour un nouveau client, rédiger, IA, version, aperçu", async ({
  page,
  context,
  baseURL,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const admin = serviceClient();
  const staff = await createStaffSession(context, baseURL!, "staff");
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const { data: matter } = await admin
    .from("matters")
    .insert({ display_number: `E2E-CT-${stamp}`, title: "Dossier contrat", status: "open", is_mock: true })
    .select("id")
    .single();
  await admin.from("matter_team").insert({ matter_id: matter!.id, user_id: staff.id, role: "responsible" });
  const created: string[] = [];
  const otherContext = await browser.newContext({ baseURL });
  const other = await createStaffSession(otherContext, baseURL!, "staff");

  try {
    await page.goto("/fr/admin/contracts");
    await expect(page.getByRole("heading", { name: "Contrats", level: 1 })).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("link", { name: "Nouveau contrat" }).click();
    await expect(page.getByRole("heading", { name: "Nouveau contrat", level: 1 })).toBeVisible();
    await page.getByLabel("Titre du contrat").fill(`Convention de mandat ${stamp}`);
    await page.getByLabel("Dossier lié").selectOption(matter!.id);
    await page.getByRole("radio", { name: "Nouveau client" }).check();
    await page.getByLabel("Nom complet").fill("Riley Démo");
    await page.getByLabel("Courriel").fill(`riley.${stamp}@example.com`);
    await page.getByLabel("Adresse").fill("12 rue Fictive\nMoncton (N.-B.)");
    await expectAccessible(page);
    await page.getByRole("button", { name: "Créer et rédiger" }).click();

    await expect(
      page.getByRole("heading", { name: `Convention de mandat ${stamp}`, level: 1 }),
    ).toBeVisible();
    created.push(page.url().split("/").pop()!);
    await expect(page.getByText("Enregistrement automatique")).toBeVisible();
    // Les champs sont remplis avec la fiche du client.
    await expect(page.locator('[data-field="client.name"]').first()).toHaveText("Riley Démo");

    // Rédaction : la deuxième section est modifiée et enregistrée seule.
    const body = page.getByRole("textbox", { name: "Texte de la section Objet du mandat" });
    await body.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" obtenir un permis de travail.");
    await expect(page.getByText("Enregistré", { exact: true })).toBeVisible();

    // Aide à la rédaction (simulateur) : proposition à côté, ajoutée à la fin.
    await page.getByRole("button", { name: "Aide à la rédaction" }).nth(1).click();
    await page.getByRole("button", { name: "Proposer" }).click();
    await expect(page.getByText("Proposition (simulateur)")).toBeVisible();
    await page.getByRole("button", { name: "Ajouter à la fin" }).click();
    await expect(page.getByText("Enregistré", { exact: true })).toBeVisible();

    // Section avec des champs (Parties) : enregistrée sans perdre les champs.
    await page.getByRole("textbox", { name: "Texte de la section Parties" }).click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" Fait en deux exemplaires.");
    await expect(page.getByText("Enregistré", { exact: true })).toBeVisible();
    await expect(page.getByText("L'enregistrement a échoué", { exact: false })).toHaveCount(0);

    // Version enregistrée.
    await page.getByLabel("Nom de la version (facultatif)").fill("Premier jet");
    await page.getByRole("button", { name: "Enregistrer une version" }).click();
    await expect(page.getByText("Version enregistrée.")).toBeVisible();
    await expect(page.getByText("v1", { exact: true })).toBeVisible();
    await expectAccessible(page);
    await page.screenshot({ path: `.tmp/qa/contract-editor-${testInfo.project.name}.png`, fullPage: true });

    // Un autre membre du personnel hors équipe : même 404 que pour un contrat inexistant.
    const otherPage = await otherContext.newPage();
    const denied = await otherPage.goto(`/fr/admin/contracts/${created[0]}`);
    expect(denied?.status()).toBe(404);

    // Aperçu : texte, champs remplis, proposition de l'IA.
    await page.getByRole("link", { name: "Aperçu" }).click();
    const sheet = page.locator("article.contract-print");
    await expect(sheet.getByText("obtenir un permis de travail.")).toBeVisible();
    await expect(sheet.getByText("Riley Démo").first()).toBeVisible();
    await expect(sheet.getByText(/Fait en deux exemplaires\./)).toBeVisible();
    await expect(sheet.getByText(/Simulateur IA/)).toBeVisible();
    await expectAccessible(page);
    await page.screenshot({ path: `.tmp/qa/contract-print-${testInfo.project.name}.png`, fullPage: true });

    // Onglet « Contrats » du dossier.
    await page.goto(`/fr/admin/matters/${matter!.id}?tab=contracts`);
    await expect(page.getByRole("link", { name: `Convention de mandat ${stamp}` })).toBeVisible();
  } finally {
    await removeContracts(created);
    await admin.from("matter_team").delete().eq("matter_id", matter!.id);
    await admin.from("matters").delete().eq("id", matter!.id);
    await other.cleanup();
    await otherContext.close();
    await staff.cleanup();
  }
});

test("contrats : verrou d'édition, une personne à la fois", async ({ page, context, baseURL, browser }) => {
  test.setTimeout(120_000);
  const admin = serviceClient();
  const author = await createStaffSession(context, baseURL!, "staff");
  const adminContext = await browser.newContext({ baseURL });
  const firmAdmin = await createStaffSession(adminContext, baseURL!, "firm_admin");
  const { data: contract } = await admin
    .from("contracts")
    .insert({ title: "Contrat verrou", client_name: "Client Démo", created_by: author.id, is_mock: true })
    .select("id")
    .single();
  try {
    await page.goto(`/en/admin/contracts/${contract!.id}`);
    await expect(page.getByText("Automatic saving")).toBeVisible();
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`/en/admin/contracts/${contract!.id}`);
    await expect(adminPage.getByText(/Being edited by Morgan Test: read only\./)).toBeVisible();
    await expect(adminPage.getByRole("button", { name: "Save details" })).toBeDisabled();
    await expectAccessible(adminPage);
  } finally {
    await removeContracts([contract!.id]);
    await firmAdmin.cleanup();
    await adminContext.close();
    await author.cleanup();
  }
});
