import { serviceClient } from "../integration/helpers";
import { createStaffSession, expect, expectAccessible, test } from "./fixtures";

/**
 * Clio (ADR 0038, faux Clio en local) : dépôt du contrat validé (Clio à faire, SharePoint en attente
 * de Microsoft, puis « déposé ») ; agenda Clio du dossier et import d'une entrée comme date de cour.
 */
test("Clio : rangement du contrat validé et import de l'agenda du dossier", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const admin = serviceClient();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const clioId = String(Math.floor(Math.random() * 900_000_000) + 100_000_000);
  const lawyer = await createStaffSession(context, baseURL!, "staff");
  const { data: matter } = await admin
    .from("matters")
    .insert({
      display_number: `E2E-CL-${stamp}`,
      title: "Dossier Clio",
      status: "open",
      is_mock: true,
      clio_matter_id: clioId,
    })
    .select("id")
    .single();
  await admin.from("matter_team").insert({ matter_id: matter!.id, user_id: lawyer.id, role: "responsible" });
  const { data: contract } = await admin
    .from("contracts")
    .insert({
      title: `Mandat ${stamp}`,
      language: "fr",
      matter_id: matter!.id,
      client_name: "Client Démo",
      created_by: lawyer.id,
    })
    .select("id")
    .single();
  await admin.from("contract_sections").insert({
    contract_id: contract!.id,
    position: 0,
    title: "Objet",
    body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Texte." }] }] },
  });
  try {
    // Validation : Clio « en cours de dépôt », SharePoint « en attente du branchement Microsoft ».
    await page.goto(`/fr/admin/contracts/${contract!.id}`);
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Valider le contrat" }).click();
    await expect(page.getByRole("heading", { name: "Rangement du contrat" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("en attente de l'accord du cabinet pour le dépôt réel")).toBeVisible();
    await expect(page.getByText("en attente du branchement Microsoft")).toBeVisible();

    // Passage du planificateur (simulé ici) : le dépôt est réservé puis réussi.
    const { data: claimed } = await admin.rpc("contract_deposit_claim", { p_limit: 50 });
    const mine = (claimed ?? []).filter((d: { contract_id: string }) => d.contract_id === contract!.id);
    expect(mine).toHaveLength(1);
    const first = mine[0]!;
    expect(first.pdf_base64.length).toBeGreaterThan(100);
    await admin.rpc("contract_deposit_result", {
      p_id: first.id,
      p_ok: true,
      p_external_id: "700001",
      p_error: null as unknown as string,
    });
    await page.reload();
    await expect(page.getByText("déposé", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expectAccessible(page);

    // Agenda Clio du dossier : une audience et un rendez-vous (faux Clio) ; import du rendez-vous.
    await page.goto(`/fr/admin/matters/${matter!.id}?tab=court`);
    await expect(page.getByRole("heading", { name: "Agenda Clio du dossier" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Audience — Cour suprême (démo)", { exact: true })).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: "Importer : Rencontre avec le client (démo)" }).click();
    await expect(page.getByText(/Date importée de Clio/)).toBeVisible({ timeout: 15_000 });
    const { data: imported } = await admin
      .from("court_dates")
      .select("source, status, clio_sync_status")
      .eq("matter_id", matter!.id);
    expect(imported).toEqual([{ source: "clio", status: "scheduled", clio_sync_status: "synced" }]);
  } finally {
    await admin.from("court_dates").delete().eq("matter_id", matter!.id);
    await admin.from("contract_deposits").delete().eq("contract_id", contract!.id);
    await admin.from("matter_team").delete().eq("matter_id", matter!.id);
    // Dossier de test fermé et délié de Clio : le planificateur local ne le relit plus.
    await admin.from("matters").update({ status: "closed", clio_matter_id: null }).eq("id", matter!.id);
    await lawyer.cleanup();
  }
});
