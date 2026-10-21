import { serviceClient } from "../integration/helpers";
import { createStaffSession, expect, expectAccessible, test } from "./fixtures";

/** Contrats, lot 2 (ADR 0034, F4 à F6) : modèles, services et taxes, clauses, pages réservées au firm_admin. */
const FEES_TEMPLATE = "10000000-0000-4000-8000-0000000c0005";

async function removeContracts(ids: string[]) {
  const admin = serviceClient();
  if (!ids.length) return;
  await admin.from("contract_line_items").delete().in("contract_id", ids);
  await admin.from("contract_versions").delete().in("contract_id", ids);
  await admin.from("contract_sections").delete().in("contract_id", ids);
  await admin.from("contracts").delete().in("id", ids);
}

test("modèles : partir d'un modèle, services et taxes de la province calculés", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(150_000);
  await createStaffSession(context, baseURL!, "staff");
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const created: string[] = [];
  try {
    await page.goto("/fr/admin/contracts/templates");
    await expect(page.getByRole("heading", { name: "Modèles de contrats", level: 1 })).toBeVisible();
    // Le personnel simple ne voit ni les onglets réservés ni les boutons d'édition.
    await expect(page.getByRole("link", { name: "Clauses", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Modifier" })).toHaveCount(0);
    // Seuls les modèles publiés lui sont visibles : les brouillons FR à faire valider restent au firm_admin.
    await expect(page.getByText("Client Service Terms — Businesses & Organizations")).toBeVisible();
    await expect(page.getByText("À faire valider par un avocat")).toHaveCount(0);
    await expectAccessible(page);

    await page.goto(`/fr/admin/contracts/new?template=${FEES_TEMPLATE}`);
    await expect(page.getByLabel("Partir de")).toHaveValue(FEES_TEMPLATE);
    await page.getByLabel("Titre du contrat").fill(`Convention ${stamp}`);
    await page.getByRole("radio", { name: "Nouveau client" }).check();
    await page.getByLabel("Nom complet").fill("Sam Démo");
    await page.getByLabel("Courriel").fill(`sam.${stamp}@example.com`);
    await page.getByLabel("Province du client (pour les taxes)").selectOption("NB");
    await expectAccessible(page);
    await page.getByRole("button", { name: "Créer et rédiger" }).click();

    await expect(page.getByRole("heading", { name: `Convention ${stamp}`, level: 1 })).toBeVisible();
    created.push(page.url().split("/").pop()!);
    // Sections et services copiés du modèle ; TVH du Nouveau-Brunswick (15 %) sur 2 750 $.
    await expect(page.getByRole("textbox", { name: "Texte de la section Honoraires" })).toBeVisible();
    const panel = page.getByRole("region", { name: "Services et honoraires" });
    await expect(panel.getByText(/2\s750,00/)).toBeVisible();
    await expect(panel.getByText(/412,50/)).toBeVisible();
    await expect(panel.getByText(/3\s162,50/)).toBeVisible();
    await expect(page.locator('[data-field="fees.total"]').first()).toHaveText(/3\s162,50/);

    // Ajout d'une ligne du catalogue, puis enregistrement.
    await panel.getByLabel("Ajouter depuis le catalogue…").selectOption({ index: 1 });
    await panel.getByRole("button", { name: "Enregistrer les services" }).click();
    await expect(panel.getByText("Services enregistrés.")).toBeVisible();
    const { count } = await serviceClient()
      .from("contract_line_items")
      .select("id", { count: "exact", head: true })
      .eq("contract_id", created[0]!);
    expect(count).toBe(3);
    await expectAccessible(page);

    // Pages du firm_admin : même 404 pour le personnel simple.
    for (const path of ["/fr/admin/contracts/clauses", "/fr/admin/contracts/services"]) {
      const res = await page.goto(path);
      expect(res?.status()).toBe(404);
    }
  } finally {
    await removeContracts(created);
  }
});

test("firm_admin : clauses, services et taux de taxes", async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  await createStaffSession(context, baseURL!, "firm_admin");
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const admin = serviceClient();
  const created: string[] = [];
  const templates: string[] = [];
  try {
    await page.goto("/fr/admin/contracts/clauses");
    await expect(page.getByRole("heading", { name: "Bibliothèque de clauses", level: 1 })).toBeVisible();
    await expectAccessible(page);
    await page.locator("#cl-title-new").fill(`Clause E2E ${stamp}`);
    await page.locator("#cl-lang-new").selectOption("fr");
    await page.locator("#cl-body-new").fill("Premier paragraphe.\n\nSecond paragraphe.");
    await page.getByRole("button", { name: "Ajouter la clause" }).click();
    await expect(page.getByText("Clause enregistrée.")).toBeVisible();
    await expect(page.getByText(`Clause E2E ${stamp}`)).toBeVisible();

    await page.goto("/fr/admin/contracts/services");
    await expect(page.getByRole("heading", { name: "Services et taxes", level: 1 })).toBeVisible();
    await expect(page.getByText("À vérifier").first()).toBeVisible();
    await expectAccessible(page);
    await page.locator("#sv-fr-new").fill(`Service E2E ${stamp}`);
    await page.locator("#sv-en-new").fill(`E2E service ${stamp}`);
    await page.locator("#sv-amount-new").fill("99.50");
    await page.getByRole("button", { name: "Ajouter le service" }).click();
    await expect(page.getByText("Service enregistré.")).toBeVisible();
    await expect(page.getByText(`Service E2E ${stamp}`)).toBeVisible();

    await page.goto("/fr/admin/contracts/templates");
    await expect(page.getByText("À faire valider par un avocat").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Relire et publier" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Clauses", exact: true })).toBeVisible();

    // « Enregistrer comme modèle » : créé en brouillon, invisible du personnel tant qu'il n'est pas publié.
    await page.goto("/fr/admin/contracts/new");
    await page.getByLabel("Titre du contrat").fill(`Source ${stamp}`);
    await page.getByRole("radio", { name: "Nouveau client" }).check();
    await page.getByLabel("Nom complet").fill("Alex Démo");
    await page.getByLabel("Courriel").fill(`alex.${stamp}@example.com`);
    await page.getByRole("button", { name: "Créer et rédiger" }).click();
    await expect(page.getByRole("heading", { name: `Source ${stamp}`, level: 1 })).toBeVisible();
    created.push(page.url().split("/").pop()!);
    await page.getByText("Enregistrer comme modèle").click();
    await page.getByLabel("Nom du modèle").fill(`Modèle E2E ${stamp}`);
    await page.getByRole("button", { name: "Créer le modèle" }).click();
    // La case de confirmation est obligatoire.
    await expect(page.getByText("Modèle créé en brouillon.", { exact: false })).toHaveCount(0);
    await page.getByLabel("J'ai retiré toute donnée propre au client.").check();
    await page.getByRole("button", { name: "Créer le modèle" }).click();
    await expect(page.getByText("Modèle créé en brouillon.", { exact: false })).toBeVisible();
    const { data: tpl } = await admin
      .from("contract_templates")
      .select("id, status")
      .eq("name", `Modèle E2E ${stamp}`)
      .single();
    expect(tpl?.status).toBe("draft");
    if (tpl) templates.push(tpl.id);
  } finally {
    await removeContracts(created);
    if (templates.length) {
      await admin.from("contract_template_versions").delete().in("template_id", templates);
      await admin.from("contract_templates").delete().in("id", templates);
    }
    await admin.from("contract_clause_history").delete().eq("title", `Clause E2E ${stamp}`);
    await admin.from("contract_clauses").delete().eq("title", `Clause E2E ${stamp}`);
    await admin.from("service_catalog").delete().eq("name_fr", `Service E2E ${stamp}`);
  }
});
