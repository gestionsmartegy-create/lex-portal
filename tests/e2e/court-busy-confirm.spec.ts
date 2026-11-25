import { serviceClient } from "../integration/helpers";
import { mockBusyBlocks } from "../../lib/outlook-simulator";
import { createStaffSession, expect, expectAccessible, test } from "./fixtures";

/**
 * Confirmation d'une date de cour quand un avocat présent est occupé dans Outlook (simulateur) :
 * l'agenda est relu au moment de confirmer ; la date n'est pas confirmée sans « Confirmer quand même »,
 * et ce choix est journalisé.
 */
test("confirmer une date en conflit avec Outlook : avertissement, puis « confirmer quand même »", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.setTimeout(120_000);
  const admin = serviceClient();
  // firm_admin : peut confirmer (équipe du dossier) et lire le journal d'audit.
  const staff = await createStaffSession(context, baseURL!, "firm_admin");
  const { data: matter } = await admin
    .from("matters")
    .insert({ display_number: `E2E-BUSY-${Date.now()}`, title: "Conflit", status: "open", is_mock: true })
    .select("id")
    .single();
  await admin.from("matter_team").insert({ matter_id: matter!.id, user_id: staff.id, role: "responsible" });
  // Agenda connecté (simulateur), sans plage occupée enregistrée : seule la relecture au moment de
  // confirmer peut voir le conflit.
  await admin.rpc("calendar_save_connection", {
    p_user: staff.id,
    p_is_mock: true,
    p_payload: null as unknown as string,
    p_scopes: [],
  });
  const now = Date.now();
  const block = mockBusyBlocks(staff.id, new Date(now + 2 * 86_400_000), new Date(now + 20 * 86_400_000))[0]!;
  const start = new Date(Date.parse(block.start) + 15 * 60_000);
  const { data: date } = await admin
    .from("court_dates")
    .insert({
      matter_id: matter!.id,
      kind: "hearing",
      starts_at: start.toISOString(),
      timezone: "America/Halifax",
      status: "scheduled",
    })
    .select("id")
    .single();
  await admin.from("court_date_attendees").insert({ court_date_id: date!.id, user_id: staff.id });

  try {
    await page.goto(`/en/admin/matters/${matter!.id}?tab=court`);
    const item = page.locator("li", { hasText: "Hearing ·" }).first();
    await item.getByRole("button", { name: "Confirm this date" }).click();

    // Avertissement : la date reste « à confirmer ».
    await expect(page.getByText(/busy in Outlook at that time/).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("li", { hasText: "Hearing ·" }).first()).toContainText("To be confirmed");
    const { data: still } = await admin.from("court_dates").select("status").eq("id", date!.id).single();
    expect(still?.status).toBe("scheduled");
    await expectAccessible(page);
    await page.screenshot({ path: `.tmp/qa/court-busy-${testInfo.project.name}.png`, fullPage: true });

    // L'avocat passe outre : la date est confirmée et le choix est journalisé.
    await page.getByRole("button", { name: "Confirm anyway" }).click();
    await expect(page.getByText("Court date confirmed.")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("li", { hasText: "Hearing ·" }).first()).toContainText("Confirmed");
    await page.goto("/en/admin/audit");
    await expect(page.getByText("court_date.confirmed_despite_conflict").first()).toBeVisible();

    // Même parcours en français : le texte est traduit.
    await page.goto(`/fr/admin/matters/${matter!.id}?tab=court&notice=courtBusyConflict&busy=${date!.id}`);
    await expect(page.getByText(/occupé dans Outlook à cette heure-là/).first()).toBeVisible();
  } finally {
    await admin.rpc("calendar_disconnect", { p_user: staff.id }).then(
      () => undefined,
      () => undefined,
    );
    await admin.from("court_dates").delete().eq("matter_id", matter!.id);
    await admin.from("matter_team").delete().eq("matter_id", matter!.id);
    await admin.from("matters").delete().eq("id", matter!.id);
    await staff.cleanup();
  }
});
