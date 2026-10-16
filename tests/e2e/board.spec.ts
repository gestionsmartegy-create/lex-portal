import { serviceClient } from "../integration/helpers";
import { createStaffSession, expect, expectAccessible, test } from "./fixtures";

/** Suivi de portefeuille (ADR 0023) : tableau par étape, vues enregistrées, panneau « À surveiller ». */
test("tableau par étape, vue enregistrée et panneau « À surveiller »", async ({
  page,
  context,
  baseURL,
  client,
}, testInfo) => {
  test.setTimeout(180_000);
  const admin = serviceClient();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const staff = await createStaffSession(context, baseURL!, "firm_admin");
  // Un type de dossier avec au moins deux étapes de modèle.
  const { data: typeSteps } = await admin
    .from("matter_type_steps")
    .select("matter_type_id, position, title_fr, title_en")
    .order("position");
  const counts = new Map<string, number>();
  for (const s of typeSteps ?? []) counts.set(s.matter_type_id, (counts.get(s.matter_type_id) ?? 0) + 1);
  const typeId = [...counts.entries()].find(([, n]) => n >= 2)![0];
  const steps = (typeSteps ?? []).filter((s) => s.matter_type_id === typeId);

  const { data: matters } = await admin
    .from("matters")
    .insert([
      {
        display_number: `E2E-BRD-A-${stamp}`,
        title: `Board A ${stamp}`,
        status: "open",
        is_mock: true,
        matter_type_id: typeId,
      },
      {
        display_number: `E2E-BRD-B-${stamp}`,
        title: `Board B ${stamp}`,
        status: "open",
        is_mock: true,
        matter_type_id: typeId,
      },
      {
        display_number: `E2E-BRD-C-${stamp}`,
        title: `Board C ${stamp}`,
        status: "open",
        is_mock: true,
        matter_type_id: typeId,
      },
    ])
    .select("id, title");
  const [a, b, c] = matters!;
  const now = new Date().toISOString();
  await admin.from("matter_timeline_steps").insert([
    // A : première étape terminée, la deuxième est en cours.
    {
      matter_id: a!.id,
      position: 1,
      title: steps[0]!.title_fr,
      title_en: steps[0]!.title_en,
      is_completed: true,
      completed_at: now,
    },
    {
      matter_id: a!.id,
      position: 2,
      title: steps[1]!.title_fr,
      title_en: steps[1]!.title_en,
      is_completed: false,
      completed_at: null,
    },
    // C : toutes les étapes terminées.
    {
      matter_id: c!.id,
      position: 1,
      title: steps[0]!.title_fr,
      title_en: steps[0]!.title_en,
      is_completed: true,
      completed_at: now,
    },
  ]);
  await admin.from("matter_access").insert(
    [a!, b!].map((m) => ({
      matter_id: m.id,
      user_id: client.id,
      access_level: "read",
      granted_by: staff.id,
    })),
  );
  const requestTitle = `Pièce en retard ${stamp}`;
  await admin.from("document_requests").insert({
    matter_id: a!.id,
    requested_from: client.id,
    title: requestTitle,
    status: "pending",
    due_date: "2020-01-02",
  });
  const soon = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const deliverableTitle = `Livrable proche ${stamp}`;
  await admin
    .from("matter_deliverables")
    .insert({ matter_id: b!.id, title: deliverableTitle, status: "planned", due_date: soon });
  const viewName = `Vue e2e ${stamp}`;
  const shot = (name: string) =>
    page.screenshot({ path: `.tmp/qa/${name}-${testInfo.project.name}.png`, fullPage: true });

  try {
    // Tableau par étape.
    await page.goto(`/en/admin/matters?view=board&type=${typeId}&q=${stamp}`);
    const board = page.getByRole("region", { name: "Matters by step" });
    await expect(board).toBeVisible({ timeout: 15_000 });
    await expect(board.getByRole("region", { name: steps[1]!.title_en }).getByText(a!.title)).toBeVisible();
    await expect(board.getByRole("region", { name: "No steps yet" }).getByText(b!.title)).toBeVisible();
    await expect(
      board.getByRole("region", { name: "All steps completed" }).getByText(c!.title),
    ).toBeVisible();
    await expectAccessible(page);
    await shot("board");

    // Vue enregistrée : enregistrée, retrouvée, puis retirée.
    await page.getByLabel("Name of this view").fill(viewName);
    await page.getByRole("button", { name: "Save this view" }).click();
    await expect(page.getByText("View saved.")).toBeVisible({ timeout: 15_000 });
    await page.goto("/en/admin/matters");
    await page.getByRole("link", { name: viewName }).click();
    await expect(page.getByRole("region", { name: "Matters by step" })).toBeVisible({ timeout: 15_000 });
    await expectAccessible(page);
    await page.getByRole("button", { name: `Remove the view ${viewName}` }).click();
    await expect(page.getByText("View removed.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: viewName })).toHaveCount(0);

    // Sans type choisi : invitation à choisir un type.
    await page.goto("/en/admin/matters?view=board");
    await expect(page.getByText(/Choose a matter type in the filters/)).toBeVisible();

    // Panneau « À surveiller ».
    await page.goto("/en/admin");
    await expect(page.getByRole("heading", { name: "To watch" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: requestTitle })).toBeVisible();
    await expect(page.getByRole("link", { name: deliverableTitle })).toBeVisible();
    await expectAccessible(page);
    await shot("watchlist");

    // Version française.
    await page.goto(`/fr/admin/matters?view=board&type=${typeId}&q=${stamp}`);
    await expect(page.getByRole("region", { name: "Dossiers par étape" })).toBeVisible({ timeout: 15_000 });
    await page.goto("/fr/admin");
    await expect(page.getByRole("heading", { name: "À surveiller" })).toBeVisible({ timeout: 15_000 });
  } finally {
    const ids = matters!.map((m) => m.id);
    await admin.from("matter_saved_views").delete().eq("owner_id", staff.id);
    await admin.from("document_requests").delete().in("matter_id", ids);
    await admin.from("notifications").delete().in("matter_id", ids);
    await admin.from("matter_deliverables").delete().in("matter_id", ids);
    await admin.from("matter_timeline_steps").delete().in("matter_id", ids);
    await admin.from("matter_access").delete().in("matter_id", ids);
    await admin.from("matters").delete().in("id", ids);
    await staff.cleanup();
  }
});
