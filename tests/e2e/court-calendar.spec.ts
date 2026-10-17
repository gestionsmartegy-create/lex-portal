import { serviceClient } from "../integration/helpers";
import { createStaffSession, expect, expectAccessible, test } from "./fixtures";

/** Calendrier de cour (ADR 0026) : mois, semaine, liste, filtres, conflits, accueil « 14 prochains jours ». */
test("calendrier de cour : vues, filtres, conflit d'horaire et accueil", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.setTimeout(180_000);
  const admin = serviceClient();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const staff = await createStaffSession(context, baseURL!, "firm_admin");
  const { data: ottawa } = await admin.from("offices").select("id").eq("name_en", "Ottawa").single();
  const { data: court } = await admin
    .from("courts")
    .select("id")
    .eq("name_en", "Ontario Superior Court of Justice")
    .single();
  const { data: otherCourt } = await admin
    .from("courts")
    .select("id")
    .eq("name_en", "Ontario Court of Justice")
    .single();
  const { data: matter } = await admin
    .from("matters")
    .insert({
      display_number: `E2E-CAL-${stamp}`,
      title: `Calendrier ${stamp}`,
      status: "open",
      is_mock: true,
      office_id: ottawa!.id,
    })
    .select("id")
    .single();
  // Dans 3 jours (accueil) : deux dates du même avocat, à 30 minutes d'intervalle dans deux tribunaux.
  const soon = new Date(Date.now() + 3 * 86_400_000);
  soon.setUTCHours(15, 0, 0, 0);
  const iso = (d: Date, minutes = 0) => new Date(d.getTime() + minutes * 60_000).toISOString();
  const { data: dates } = await admin
    .from("court_dates")
    .insert([
      {
        matter_id: matter!.id,
        kind: "hearing",
        starts_at: iso(soon),
        ends_at: iso(soon, 60),
        timezone: "America/Toronto",
        court_id: court!.id,
        status: "confirmed",
      },
      {
        matter_id: matter!.id,
        kind: "motion",
        starts_at: iso(soon, 90),
        ends_at: iso(soon, 120),
        timezone: "America/Toronto",
        court_id: otherCourt!.id,
        status: "scheduled",
      },
      {
        matter_id: matter!.id,
        kind: "trial",
        starts_at: "2026-12-15T14:30:00Z",
        ends_at: "2026-12-15T21:00:00Z",
        timezone: "America/Toronto",
        court_id: court!.id,
        status: "scheduled",
      },
    ])
    .select("id");
  await admin
    .from("court_date_attendees")
    .insert(dates!.slice(0, 2).map((d) => ({ court_date_id: d.id, user_id: staff.id })));
  const day = soon.toISOString().slice(0, 10);
  const shot = (name: string) =>
    page.screenshot({ path: `.tmp/qa/${name}-${testInfo.project.name}.png`, fullPage: true });

  try {
    // Liste : la date à 30 min d'intervalle dans un autre tribunal est en conflit.
    await page.goto(`/en/admin/court-calendar?date=${day}&office=${ottawa!.id}`);
    await expect(page.getByRole("heading", { name: "Court calendar", level: 1 })).toBeVisible();
    await expect(page.getByText(`Hearing · E2E-CAL-${stamp}`)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Schedule conflict")).toHaveCount(2);
    await expect(page.getByText("To be confirmed", { exact: true }).first()).toBeVisible();
    await expectAccessible(page);
    await shot("court-calendar-list");

    // Mois de décembre 2026 : le procès apparaît le 15 (grille sur ordinateur, liste sur téléphone).
    await page.goto(`/en/admin/court-calendar?view=month&date=2026-12-15&office=${ottawa!.id}`);
    await expect(page.getByText("December 2026", { exact: true })).toBeVisible();
    await expect(page.getByText(`Trial · E2E-CAL-${stamp}`).filter({ visible: true }).first()).toBeVisible();
    await expectAccessible(page);
    await shot("court-calendar-month");

    // Semaine et filtre « Type » : seulement la requête.
    await page.goto(`/en/admin/court-calendar?view=week&date=${day}&office=${ottawa!.id}&kind=motion`);
    await expect(page.getByText(`Motion · E2E-CAL-${stamp}`).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText(`Hearing · E2E-CAL-${stamp}`)).toHaveCount(0);
    await expectAccessible(page);

    // Accueil : dates des 14 prochains jours et alertes.
    await page.goto("/en/admin");
    await expect(page.getByRole("heading", { name: "Court dates in the next 14 days" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("link", { name: `Hearing · E2E-CAL-${stamp}` }).first()).toBeVisible();
    await expect(page.getByText(/To check: \d+ conflict\(s\)/)).toBeVisible();
    await expectAccessible(page);

    await page.goto(`/fr/admin/court-calendar?view=month&date=2026-12-15`);
    await expect(page.getByRole("heading", { name: "Calendrier de cour", level: 1 })).toBeVisible();
    await expect(page.getByText("décembre 2026", { exact: true })).toBeVisible();
  } finally {
    await admin.from("court_dates").delete().eq("matter_id", matter!.id);
    await admin.from("matters").delete().eq("id", matter!.id);
    await staff.cleanup();
  }
});

/** Personnel d'une autre équipe : ne voit pas les dates d'un dossier qui n'est pas le sien. */
test("calendrier de cour : personnel hors équipe sans les dates des autres", async ({
  page,
  context,
  baseURL,
}) => {
  const admin = serviceClient();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const staff = await createStaffSession(context, baseURL!, "staff");
  const { data: matter } = await admin
    .from("matters")
    .insert({ display_number: `E2E-CALX-${stamp}`, title: `Autre ${stamp}`, status: "open", is_mock: true })
    .select("id")
    .single();
  await admin.from("court_dates").insert({
    matter_id: matter!.id,
    kind: "hearing",
    starts_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    timezone: "America/Halifax",
  });
  try {
    await page.goto("/en/admin/court-calendar");
    await expect(page.getByText("The court dates of your teams' matters.")).toBeVisible();
    await expect(page.getByText(`E2E-CALX-${stamp}`)).toHaveCount(0);
  } finally {
    await admin.from("court_dates").delete().eq("matter_id", matter!.id);
    await admin.from("matters").delete().eq("id", matter!.id);
    await staff.cleanup();
  }
});

/** Adjoint·e désigné·e (ADR 0027) : voit les dates de tout le cabinet, en lecture seule, sans ouvrir le dossier. */
test("calendrier de cour : adjoint·e désigné·e voit tout le cabinet en lecture seule", async ({
  page,
  context,
  baseURL,
}) => {
  const admin = serviceClient();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const staff = await createStaffSession(context, baseURL!, "staff");
  const { data: matter } = await admin
    .from("matters")
    .insert({ display_number: `E2E-CALA-${stamp}`, title: `Adjoint ${stamp}`, status: "open", is_mock: true })
    .select("id")
    .single();
  await admin.from("court_dates").insert({
    matter_id: matter!.id,
    kind: "hearing",
    starts_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    timezone: "America/Halifax",
    status: "scheduled",
    notes: "Note interne e2e",
  });
  await admin.from("court_calendar_viewers").insert({ user_id: staff.id });
  try {
    await page.goto("/en/admin/court-calendar");
    await expect(page.getByText("Every court date of the firm, all offices.")).toBeVisible({
      timeout: 15_000,
    });
    const chip = page.getByText(`Hearing · E2E-CALA-${stamp}`).filter({ visible: true }).first();
    await expect(chip).toBeVisible();
    await expect(page.getByText("Other team (read only)").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(`E2E-CALA-${stamp}`) })).toHaveCount(0);
    await expect(page.getByText("Note interne e2e")).toHaveCount(0);
    await expectAccessible(page);
    const response = await page.goto(`/en/admin/matters/${matter!.id}`);
    expect(response?.status()).toBe(404);
  } finally {
    await admin.from("court_calendar_viewers").delete().eq("user_id", staff.id);
    await admin.from("court_dates").delete().eq("matter_id", matter!.id);
    await admin.from("matters").delete().eq("id", matter!.id);
    await staff.cleanup();
  }
});
