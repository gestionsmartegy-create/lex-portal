import { serviceClient } from "../integration/helpers";
import { mockBusyBlocks } from "../../lib/outlook-simulator";
import { createStaffSession, expect, expectAccessible, test } from "./fixtures";

/** Mon agenda (lot 4, ADR 0031) : connexion Outlook (simulateur), conflit, rappels, déconnexion. */
test("mon agenda : connecter, conflit « occupé dans Outlook », rappels, déconnecter", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.setTimeout(180_000);
  const admin = serviceClient();
  const staff = await createStaffSession(context, baseURL!, "staff");
  const { data: matter } = await admin
    .from("matters")
    .insert({ display_number: `E2E-AG-${Date.now()}`, title: "Agenda", status: "open", is_mock: true })
    .select("id")
    .single();
  await admin.from("matter_team").insert({ matter_id: matter!.id, user_id: staff.id, role: "responsible" });
  // Audience qui commence 15 minutes après une plage occupée du simulateur.
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
      status: "confirmed",
    })
    .select("id")
    .single();
  await admin.from("court_date_attendees").insert({ court_date_id: date!.id, user_id: staff.id });

  try {
    await page.goto("/en/admin/my-calendar");
    await expect(page.getByRole("heading", { name: "My calendar", level: 1 })).toBeVisible();
    await expect(page.getByText("Not connected")).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: "Connect my Outlook calendar" }).click();
    await expect(page.getByText(/Your calendar is connected/)).toBeVisible();
    await expect(page.getByText("Demo data")).toBeVisible();
    await page.getByRole("button", { name: "Turn on reminders" }).click();
    await expect(page.getByText(/Reminders on: they appear/)).toBeVisible();
    await expectAccessible(page);
    await page.screenshot({ path: `.tmp/qa/my-calendar-${testInfo.project.name}.png`, fullPage: true });

    // Calendrier de cour : la date est en conflit avec l'agenda.
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Halifax" }).format(start);
    await page.goto(`/en/admin/court-calendar?view=list&date=${day}`);
    await expect(page.getByText("Busy in Outlook").first()).toBeVisible();

    await page.goto("/fr/admin/my-calendar");
    await expect(page.getByRole("heading", { name: "Mon agenda", level: 1 })).toBeVisible();
    await expect(page.getByText("Rappels activés", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Déconnecter mon agenda" }).click();
    await expect(page.getByText(/Votre agenda est déconnecté/)).toBeVisible();
    await expect(page.getByText("Non connecté")).toBeVisible();
    await expectAccessible(page);
  } finally {
    await admin.from("court_dates").delete().eq("matter_id", matter!.id);
    await admin.from("matter_team").delete().eq("matter_id", matter!.id);
    await admin.from("matters").delete().eq("id", matter!.id);
    await staff.cleanup();
  }
});

test("agendas connectés : le firm_admin voit et coupe une connexion", async ({ page, context, baseURL }) => {
  const admin = serviceClient();
  const staff = await createStaffSession(context, baseURL!, "firm_admin");
  try {
    await admin.rpc("calendar_save_connection", {
      p_user: staff.id,
      p_is_mock: true,
      p_payload: null as unknown as string,
      p_scopes: [],
    });
    await page.goto("/en/admin/integrations");
    const section = page.locator("section", {
      has: page.getByRole("heading", { name: "Connected Outlook calendars" }),
    });
    await expect(section.getByText(/simulator/).first()).toBeVisible();
    await expectAccessible(page);
    const before = await section.getByRole("button", { name: "Cut connection" }).count();
    await section.getByRole("button", { name: "Cut connection" }).first().click();
    await expect(page.getByText("The calendar connection was cut.")).toBeVisible();
    await expect(section.getByRole("button", { name: "Cut connection" })).toHaveCount(before - 1);
  } finally {
    await staff.cleanup();
  }
});

test("mon agenda : réservé au personnel", async ({ page }) => {
  const response = await page.goto("/en/admin/my-calendar");
  expect(response?.url()).toContain("/login");
});
