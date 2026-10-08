import { serviceClient } from "../integration/helpers";
import { createStaffSession, expect, expectAccessible, test } from "./fixtures";

/** Demandes de documents sur plusieurs dossiers (ADR 0022) : envoi groupé, puis action groupée. */
test("demande envoyée à plusieurs dossiers, puis marquée reçue en une fois", async ({
  page,
  context,
  baseURL,
  client,
}) => {
  test.setTimeout(180_000);
  const admin = serviceClient();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const staff = await createStaffSession(context, baseURL!, "firm_admin");
  // Deux dossiers fictifs, étiquetés « Relance client », avec le client du test.
  const { data: tag } = await admin
    .from("matter_tags")
    .select("id")
    .eq("name_en", "Client follow-up")
    .single();
  const { data: matters } = await admin
    .from("matters")
    .insert([
      { display_number: `E2E-REQ-A-${stamp}`, title: "Dossier e2e A", status: "open", is_mock: true },
      { display_number: `E2E-REQ-B-${stamp}`, title: "Dossier e2e B", status: "open", is_mock: true },
    ])
    .select("id");
  const ids = (matters ?? []).map((m) => m.id);
  await admin
    .from("matter_access")
    .insert(
      ids.map((id) => ({ matter_id: id, user_id: client.id, access_level: "read", granted_by: staff.id })),
    );
  await admin.from("matter_tag_links").insert(ids.map((id) => ({ matter_id: id, tag_id: tag!.id })));
  const docTitle = `Relevé e2e ${stamp}`;
  try {
    await page.goto(`/en/admin/requests/new?tag=${tag!.id}`);
    await expectAccessible(page);
    // Seuls nos deux dossiers restent cochés.
    for (const box of await page.locator('input[name="matterIds"]').all()) {
      const value = await box.getAttribute("value");
      if (!ids.includes(value!)) await box.uncheck();
    }
    await page.getByLabel("Document requested").fill(docTitle);
    await page.getByRole("button", { name: "Send the requests" }).click();
    await expect(page.getByText("Requests created: 2 done, 0 skipped, 0 failed.")).toBeVisible({
      timeout: 30_000,
    });

    await page.getByLabel("Search (document or matter)").fill(docTitle);
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page.getByText("2 requests")).toBeVisible({ timeout: 15_000 });
    for (const box of await page.locator('input[name="ids"]').all()) await box.check();
    await page.getByLabel("For the checked requests").selectOption("fulfilled");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("Mark received: 2 done, 0 skipped, 0 failed.")).toBeVisible({
      timeout: 30_000,
    });
    await expectAccessible(page);
  } finally {
    for (const id of ids) {
      await admin.from("document_requests").delete().eq("matter_id", id);
      await admin.from("notifications").delete().eq("matter_id", id);
      await admin.from("matter_tag_links").delete().eq("matter_id", id);
      await admin.from("matter_access").delete().eq("matter_id", id);
      await admin.from("matters").delete().eq("id", id);
    }
    await staff.cleanup();
  }
});

/** Personnel hors de l'équipe : ne voit pas la demande, et un envoi fabriqué vers le dossier ne crée rien. */
test("personnel hors équipe : aucune demande visible ni créée sur un dossier d'une autre équipe", async ({
  page,
  context,
  baseURL,
  client,
}) => {
  test.setTimeout(120_000);
  const admin = serviceClient();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const staff = await createStaffSession(context, baseURL!, "staff");
  const { data: matter } = await admin
    .from("matters")
    .insert({ display_number: `E2E-REQ-X-${stamp}`, title: "Dossier e2e X", status: "open", is_mock: true })
    .select("id")
    .single();
  const matterId = matter!.id;
  await admin
    .from("matter_access")
    .insert({ matter_id: matterId, user_id: client.id, access_level: "read", granted_by: staff.id });
  const docTitle = `Pièce hors équipe ${stamp}`;
  await admin
    .from("document_requests")
    .insert({ matter_id: matterId, requested_from: client.id, title: docTitle, status: "pending" });
  try {
    await page.goto(`/en/admin/requests?q=${encodeURIComponent(docTitle)}`);
    await expect(page.getByText("No document request.")).toBeVisible({ timeout: 15_000 });

    // Envoi groupé fabriqué : on injecte l'identifiant du dossier d'une autre équipe dans le formulaire.
    await page.goto("/en/admin/requests/new");
    await page.evaluate((id) => {
      const form = document.querySelector('form input[name="title"]')!.closest("form")!;
      for (const box of form.querySelectorAll('input[name="matterIds"]')) box.remove();
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "matterIds";
      input.value = id;
      form.appendChild(input);
      form.querySelector("button[type=submit]")!.removeAttribute("disabled");
    }, matterId);
    await page.getByLabel("Document requested").fill(`Fabriqué ${stamp}`);
    await page.getByRole("button", { name: "Send the requests" }).click();
    await expect(page.getByText(/Requests created: 0 done/)).toBeVisible({ timeout: 30_000 });
    const { count } = await admin
      .from("document_requests")
      .select("id", { count: "exact", head: true })
      .eq("matter_id", matterId);
    expect(count).toBe(1);
  } finally {
    await admin.from("document_requests").delete().eq("matter_id", matterId);
    await admin.from("notifications").delete().eq("matter_id", matterId);
    await admin.from("matter_access").delete().eq("matter_id", matterId);
    await admin.from("matters").delete().eq("id", matterId);
    await staff.cleanup();
  }
});
