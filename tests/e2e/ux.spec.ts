import { JOHN_MATTER, serviceClient } from "../integration/helpers";
import { createStaffSession, expect, expectAccessible, signInWithMfa, test } from "./fixtures";

/**
 * Lot « Expérience utilisateur » (ADR 0033) : « Ma journée », menu regroupé avec sous-menus,
 * recherche globale (Ctrl K), cloche, actions « ⋯ » et accueil client « Ce que vous devez faire ».
 */
test("Ma journée : compteurs, audiences, sous-menus, recherche et cloche", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.setTimeout(120_000);
  const admin = serviceClient();
  const staff = await createStaffSession(context, baseURL!, "firm_admin");
  const stamp = `${Date.now()}`;
  const { data: matter } = await admin
    .from("matters")
    .insert({
      display_number: `E2E-UX-${stamp}`,
      title: `Dossier UX ${stamp}`,
      status: "open",
      is_mock: true,
    })
    .select("id")
    .single();
  await admin.from("matter_team").insert({ matter_id: matter!.id, user_id: staff.id, role: "responsible" });
  await admin.from("court_dates").insert({
    matter_id: matter!.id,
    kind: "hearing",
    starts_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    timezone: "America/Halifax",
    status: "scheduled",
  });
  try {
    await page.goto("/fr/admin");
    await expect(page.getByRole("heading", { level: 1, name: "Bonjour, Morgan" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mes audiences" })).toBeVisible();
    await expect(page.getByText(`Audience · E2E-UX-${stamp}`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmer" }).first()).toBeVisible();
    // Menu regroupé : « Mon travail », « Clients », « Administration ».
    const nav = page.getByRole("navigation", { name: "Navigation de l'espace cabinet" }).first();
    if (testInfo.project.name === "desktop") {
      await expect(nav.getByText("Mon travail")).toBeVisible();
      await expect(nav.getByRole("link", { name: "Ma journée" })).toHaveAttribute("aria-current", "page");
    }
    await expectAccessible(page);
    await page.screenshot({ path: `.tmp/qa/ux-my-day-${testInfo.project.name}.png`, fullPage: true });

    if (testInfo.project.name === "desktop") {
      // Sous-menu au survol, puis au clavier.
      await nav.getByRole("link", { name: "Contrats" }).hover();
      await expect(
        page
          .getByRole("group", { name: "Raccourcis : Contrats" })
          .getByRole("link", { name: "Nouveau contrat" }),
      ).toBeVisible();
      await page.screenshot({ path: `.tmp/qa/ux-flyout-desktop.png` });
      await page.mouse.move(900, 600);
      // Recherche globale (Ctrl K).
      await page.keyboard.press("Control+k");
      await page.getByRole("textbox", { name: "Recherche" }).fill(`UX ${stamp}`);
      await expect(page.getByRole("link", { name: new RegExp(`Dossier UX ${stamp}`) })).toBeVisible();
      await page.screenshot({ path: `.tmp/qa/ux-search-desktop.png` });
      await page.keyboard.press("Escape");
      // Cloche : la date à confirmer y figure.
      await page.getByRole("button", { name: /Alertes/ }).click();
      await expect(
        page.getByRole("menuitem", { name: /date de cour à confirmer|dates de cour à confirmer/ }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
    }

    // Onglet Cour : action principale + menu « ⋯ ».
    await page.goto(`/fr/admin/matters/${matter!.id}?tab=court`);
    await expect(page.getByRole("button", { name: "Confirmer cette date" })).toBeVisible();
    await page.getByRole("button", { name: "Autres actions" }).first().click();
    await expect(page.getByRole("menuitem", { name: "Annuler cette date" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Aide : dates de cour" }).click();
    await expect(page.getByRole("note").getByText(/délai légal/)).toBeVisible();
    await expectAccessible(page);
    await page.screenshot({ path: `.tmp/qa/ux-court-tab-${testInfo.project.name}.png`, fullPage: true });
  } finally {
    await admin.from("court_dates").delete().eq("matter_id", matter!.id);
    await admin.from("matter_team").delete().eq("matter_id", matter!.id);
    await admin.from("matters").delete().eq("id", matter!.id);
    await staff.cleanup();
  }
});

test("accueil client : « Ce que vous devez faire »", async ({ page, client }, testInfo) => {
  const admin = serviceClient();
  const { data: request } = await admin
    .from("document_requests")
    .insert({
      matter_id: JOHN_MATTER,
      requested_from: client.id,
      title: "Copie du passeport (e2e)",
      due_date: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
    })
    .select("id")
    .single();
  try {
    await signInWithMfa(page, client.email, client.password);
    await page.goto("/fr/portal");
    await expect(page.getByRole("heading", { name: "Ce que vous devez faire" })).toBeVisible();
    await expect(page.getByText("Fournir : Copie du passeport (e2e)")).toBeVisible();
    await expect(page.getByRole("link", { name: "Déposer le document" }).first()).toBeVisible();
    await expect(page.getByText(/synchronis/i)).toHaveCount(0);
    await expectAccessible(page);
    await page.screenshot({ path: `.tmp/qa/ux-client-home-${testInfo.project.name}.png`, fullPage: true });
  } finally {
    await admin.from("document_requests").delete().eq("id", request!.id);
  }
});
