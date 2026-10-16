import { serviceClient } from "../integration/helpers";
import { createStaffSession, expect, expectAccessible, test } from "./fixtures";

/**
 * Dates de cour (ADR 0025) : saisie dans le fuseau du tribunal, confirmation, reconfirmation après
 * changement, remise liée, annulation avec motif, écriture dans le calendrier Clio (faux Clio en local).
 */
test("date de cour : saisie, confirmation, remise, annulation et écriture dans Clio", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.setTimeout(240_000);
  const admin = serviceClient();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const staff = await createStaffSession(context, baseURL!, "firm_admin");
  const clioId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const { data: matter } = await admin
    .from("matters")
    .insert({
      display_number: `E2E-CRT-${stamp}`,
      title: `Dossier cour ${stamp}`,
      status: "open",
      is_mock: true,
      clio_matter_id: clioId,
    })
    .select("id")
    .single();
  await admin.from("matter_team").insert({ matter_id: matter!.id, user_id: staff.id, role: "responsible" });
  const shot = (name: string) =>
    page.screenshot({ path: `.tmp/qa/${name}-${testInfo.project.name}.png`, fullPage: true });
  const url = `/en/admin/matters/${matter!.id}?tab=court`;

  try {
    // Calendrier Clio des dates de cour (faux Clio : « Cabinet (démo) »).
    await page.goto("/en/admin/integrations");
    await page.getByLabel("Calendar", { exact: true }).selectOption({ label: "Cabinet (démo)" });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Clio calendar saved.")).toBeVisible({ timeout: 15_000 });

    // Saisie d'une audience à Toronto, à 9 h 30 heure de l'Est.
    await page.goto(url);
    await expect(page.getByText("No upcoming court date.")).toBeVisible({ timeout: 15_000 });
    await expectAccessible(page);
    await page.getByText("Add a court date").click();
    const form = page.locator("form", { has: page.locator("#n-kind") });
    await form.getByLabel("Type").selectOption("hearing");
    await form
      .getByLabel("Court", { exact: true })
      .selectOption({ label: "Ontario Superior Court of Justice" });
    await form.getByLabel("Start (court time)").fill("2026-12-15T09:30");
    await form.getByLabel("End (optional)").fill("2026-12-15T11:00");
    await form.getByLabel("Time zone").selectOption("America/Toronto");
    await form.getByLabel("Room").fill("6-1");
    await form.getByLabel("Court file number").fill(`CV-${stamp}`);
    await form.getByLabel(/Internal notes/).fill("Note interne e2e");
    await form.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Court date saved.")).toBeVisible({ timeout: 15_000 });
    const item = page.locator("li", { hasText: "Hearing ·" }).first();
    await expect(item).toContainText("9:30");
    await expect(item).toContainText("EST");
    await expect(item).toContainText("To be confirmed");
    await expect(item).toContainText("Clio: up to date");
    const { data: saved } = await admin
      .from("court_dates")
      .select("starts_at, clio_calendar_entry_id")
      .eq("matter_id", matter!.id)
      .single();
    expect(saved!.starts_at).toMatch(/^2026-12-15T14:30:00/); // 9 h 30 EST = 14 h 30 UTC
    expect(saved!.clio_calendar_entry_id).toMatch(/^mock-/);
    await expectAccessible(page);
    await shot("court-tab");

    // Confirmation, puis changement d'heure : à reconfirmer.
    await item.getByRole("button", { name: "Confirm this date" }).click();
    await expect(page.getByText("Court date confirmed.")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("li", { hasText: "Hearing ·" }).first()).toContainText("Confirmed");
    await page.locator("li", { hasText: "Hearing ·" }).first().getByText("Edit", { exact: true }).click();
    const edit = page.locator("form", { has: page.locator('[id^="e-"][id$="-start"]') }).first();
    await edit.getByLabel("Start (court time)").fill("2026-12-15T10:00");
    await edit.getByLabel("End (optional)").fill("2026-12-15T11:30");
    await edit.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Court date saved.")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("li", { hasText: "Hearing ·" }).first()).toContainText("To be confirmed");

    // Remise à une nouvelle date : l'ancienne passe à l'historique.
    await page.locator("li", { hasText: "Hearing ·" }).first().getByText("Adjourn (new date)").click();
    const adjourn = page.locator("form", { has: page.locator('[id^="a-"][id$="-start"]') }).first();
    await adjourn.getByLabel("Start (court time)").fill("2027-01-12T09:30");
    await adjourn.getByLabel("End (optional)").fill("2027-01-12T10:30");
    await adjourn.getByRole("button", { name: "Adjourn to this date" }).click();
    await expect(page.getByText(/Court date adjourned/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
    await expect(page.getByText(/Replaces the date of/)).toBeVisible();

    // Annulation avec motif.
    const next = page.locator("li", { hasText: "Replaces the date of" }).first();
    await next.getByText("Cancel this date").click();
    await next.getByLabel("Reason (required)").fill("Règlement à l'amiable");
    await next.getByRole("button", { name: "Cancel the date" }).click();
    await expect(page.getByText("Court date cancelled.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("No upcoming court date.")).toBeVisible();
    const { data: all } = await admin
      .from("court_dates")
      .select("status, clio_calendar_entry_id")
      .eq("matter_id", matter!.id);
    expect(all!.map((d) => d.status).sort()).toEqual(["adjourned", "cancelled"]);
    // Dates annulée et remise : retirées du calendrier Clio.
    expect(all!.every((d) => d.clio_calendar_entry_id === null)).toBe(true);
    // Journal sans note interne : vérifié par pgTAP (21_dates_de_cour).

    await page.goto(`/fr/admin/matters/${matter!.id}?tab=court`);
    await expect(page.getByRole("heading", { name: "Historique" })).toBeVisible({ timeout: 15_000 });
    await expectAccessible(page);
  } finally {
    await page.goto("/en/admin/integrations");
    await page.getByLabel("Calendar", { exact: true }).selectOption("");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await admin.from("court_dates").delete().eq("matter_id", matter!.id);
    await admin.from("matter_team").delete().eq("matter_id", matter!.id);
    await admin.from("matters").delete().eq("id", matter!.id);
    await staff.cleanup();
  }
});

/** Personnel hors équipe : l'onglet « Cour » d'un dossier d'une autre équipe répond « introuvable ». */
test("date de cour : personnel hors équipe sans accès", async ({ page, context, baseURL }) => {
  const admin = serviceClient();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const staff = await createStaffSession(context, baseURL!, "staff");
  const { data: matter } = await admin
    .from("matters")
    .insert({
      display_number: `E2E-CRX-${stamp}`,
      title: `Autre équipe ${stamp}`,
      status: "open",
      is_mock: true,
    })
    .select("id")
    .single();
  try {
    const response = await page.goto(`/en/admin/matters/${matter!.id}?tab=court`);
    expect(response?.status()).toBe(404);
  } finally {
    await admin.from("matters").delete().eq("id", matter!.id);
    await staff.cleanup();
  }
});
