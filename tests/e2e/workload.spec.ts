import { serviceClient } from "../integration/helpers";
import { createStaffSession, expect, expectAccessible, test } from "./fixtures";

/** Charge de travail (ADR 0029) : par avocat, bureau, tribunal, domaine ; réservée au firm_admin. */
test("charge de travail : compteurs par avocat et par bureau, filtre, conflit", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.setTimeout(180_000);
  const admin = serviceClient();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const staff = await createStaffSession(context, baseURL!, "firm_admin");
  const { data: moncton } = await admin
    .from("offices")
    .select("id")
    .eq("name_en", "Moncton (head office)")
    .single();
  const { data: matters } = await admin
    .from("matters")
    .insert([
      {
        display_number: `E2E-WL-A-${stamp}`,
        title: "Charge A",
        status: "open",
        is_mock: true,
        office_id: moncton!.id,
      },
      {
        display_number: `E2E-WL-B-${stamp}`,
        title: "Charge B",
        status: "open",
        is_mock: true,
        office_id: moncton!.id,
      },
    ])
    .select("id");
  const ids = matters!.map((m) => m.id);
  await admin
    .from("matter_team")
    .insert(ids.map((matter_id) => ({ matter_id, user_id: staff.id, role: "responsible" })));
  const soon = new Date(Date.now() + 4 * 86_400_000);
  soon.setUTCHours(15, 0, 0, 0);
  const { data: dates } = await admin
    .from("court_dates")
    .insert(
      ids.map((matter_id, i) => ({
        matter_id,
        kind: "hearing",
        starts_at: new Date(soon.getTime() + i * 30 * 60_000).toISOString(),
        timezone: "America/Halifax",
        status: "scheduled",
      })),
    )
    .select("id");
  await admin
    .from("court_date_attendees")
    .insert(dates!.map((d) => ({ court_date_id: d.id, user_id: staff.id })));

  try {
    await page.goto(`/en/admin/workload?office=${moncton!.id}`);
    await expect(page.getByRole("heading", { name: "Workload", level: 1 })).toBeVisible();
    // Seul avocat chargé dans ce bureau : 2 dossiers, 2 dates de cour à 30 min d'intervalle, donc 2 conflits.
    const row = page.getByRole("region", { name: "By lawyer" }).getByRole("row").nth(1);
    await expect(row.getByRole("cell")).toHaveText(["—", "2", "2", "2", "2", "0"]);
    await expect(page.getByRole("region", { name: "By lawyer" })).toBeVisible();
    await expect(page.getByText("Schedule conflicts")).toBeVisible();
    await expectAccessible(page);
    await page.screenshot({ path: `.tmp/qa/workload-${testInfo.project.name}.png`, fullPage: true });

    await page.goto("/fr/admin/workload?days=90");
    await expect(page.getByRole("heading", { name: "Charge de travail", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Par bureau" })).toBeVisible();
    await expectAccessible(page);
  } finally {
    await admin.from("court_dates").delete().in("matter_id", ids);
    await admin.from("matter_team").delete().in("matter_id", ids);
    await admin.from("matters").delete().in("id", ids);
    await staff.cleanup();
  }
});

test("charge de travail : réservée au firm_admin", async ({ page, context, baseURL }) => {
  const staff = await createStaffSession(context, baseURL!, "staff");
  try {
    const response = await page.goto("/en/admin/workload");
    expect(response?.status()).toBe(404);
  } finally {
    await staff.cleanup();
  }
});
