import { serviceClient } from "../integration/helpers";
import { createStaffSession, expect, expectAccessible, test } from "./fixtures";

/**
 * Assistant IA, garde-fous (ADR 0037) : réglages et consommation (firm_admin), plafond mensuel qui
 * bloque l'aide à la rédaction, gabarit proposé créé en brouillon « à faire valider ».
 */
test("assistant IA : plafond mensuel, réglages et gabarit en brouillon", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const admin = serviceClient();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const staff = await createStaffSession(context, baseURL!, "firm_admin");
  const { data: contract } = await admin
    .from("contracts")
    .insert({ title: `IA ${stamp}`, language: "fr", client_name: "Client Démo", created_by: staff.id })
    .select("id")
    .single();
  await admin.from("contract_sections").insert({
    contract_id: contract!.id,
    position: 0,
    title: "Objet",
    body: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Texte de départ." }] }],
    },
  });
  const templateName = `Gabarit IA ${stamp}`;
  try {
    // Réglages : plafond à 0 $ → l'aide à la rédaction est refusée avec un message clair.
    await page.goto("/fr/admin/integrations");
    await expect(page.getByRole("heading", { name: "Assistant IA (rédaction)" })).toBeVisible({
      timeout: 15_000,
    });
    await expectAccessible(page);
    await page.getByLabel("Plafond mensuel (CAD)").fill("0");
    await page.getByRole("button", { name: "Enregistrer les réglages" }).click();
    await expect(page.getByText("Réglages de l'assistant IA enregistrés.")).toBeVisible({ timeout: 15_000 });

    await page.goto(`/fr/admin/contracts/${contract!.id}`);
    await page.getByRole("button", { name: "Aide à la rédaction" }).first().click();
    await page.getByRole("button", { name: "Proposer" }).click();
    await expect(page.getByText(/plafond mensuel de l'assistant est atteint/)).toBeVisible({
      timeout: 15_000,
    });

    // Plafond rétabli : la proposition (simulateur) revient.
    await page.goto("/fr/admin/integrations");
    await page.getByLabel("Plafond mensuel (CAD)").fill("50");
    await page.getByRole("button", { name: "Enregistrer les réglages" }).click();
    await expect(page.getByText(/Ce mois-ci/)).toBeVisible({ timeout: 15_000 });
    await page.goto(`/fr/admin/contracts/${contract!.id}`);
    await page.getByRole("button", { name: "Aide à la rédaction" }).first().click();
    await page.getByRole("button", { name: "Proposer" }).click();
    await expect(page.getByText("Proposition (simulateur)")).toBeVisible({ timeout: 15_000 });

    // Gabarit proposé par l'IA : brouillon « à faire valider ».
    await page.goto("/fr/admin/contracts/templates");
    await page.getByText("Créer un gabarit avec l'assistant IA").click();
    await page.locator("#ai-tpl-name").fill(templateName);
    await page
      .getByLabel("Description du contrat voulu")
      .fill("Convention pour une demande de permis de travail.");
    await page.getByRole("button", { name: "Proposer un gabarit" }).click();
    await expect(page.getByText(/Gabarit créé en brouillon/)).toBeVisible({ timeout: 15_000 });
    const row = page.locator("li", { hasText: templateName });
    await expect(row).toContainText("À faire valider par un avocat");
    await expectAccessible(page);
  } finally {
    await admin.from("ai_settings").update({ enabled: true, monthly_cap_cents: 5000 }).eq("id", true);
    const { data: tpl } = await admin.from("contract_templates").select("id").eq("name", templateName);
    const ids = (tpl ?? []).map((t) => t.id);
    if (ids.length) {
      await admin.from("contract_template_versions").delete().in("template_id", ids);
      await admin.from("contract_templates").delete().in("id", ids);
    }
    await admin.from("contract_sections").delete().eq("contract_id", contract!.id);
    await admin.from("contracts").delete().eq("id", contract!.id);
    await staff.cleanup();
  }
});
