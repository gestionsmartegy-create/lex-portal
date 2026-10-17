import { serviceClient } from "../integration/helpers";
import { createStaffSession, expect, expectAccessible, signInWithMfa, test, testIp } from "./fixtures";

/** Lot 5 (ADR 0028) : le client voit seulement les dates de cour rendues visibles, avec les consignes. */
test("client : dates de cour visibles, consignes et lien d'audience virtuelle", async ({
  browser,
  context,
  baseURL,
  client,
}, testInfo) => {
  test.setTimeout(180_000);
  const admin = serviceClient();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const staff = await createStaffSession(context, baseURL!, "firm_admin");
  const { data: matter } = await admin
    .from("matters")
    .insert({
      display_number: `E2E-CCD-${stamp}`,
      title: "Dossier cour client",
      status: "open",
      is_mock: true,
    })
    .select("id")
    .single();
  await admin
    .from("matter_access")
    .insert({ matter_id: matter!.id, user_id: client.id, access_level: "read", granted_by: staff.id });
  const { data: court } = await admin
    .from("courts")
    .select("id")
    .eq("name_en", "Supreme Court of Nova Scotia")
    .single();
  const inFiveDays = new Date(Date.now() + 5 * 86_400_000);
  inFiveDays.setUTCHours(14, 0, 0, 0);
  await admin.from("court_dates").insert([
    {
      matter_id: matter!.id,
      kind: "hearing",
      starts_at: inFiveDays.toISOString(),
      timezone: "America/Halifax",
      court_id: court!.id,
      room: "7",
      mode: "hybrid",
      virtual_link: "https://meet.example.com/e2e",
      client_instructions: `Arrivez 30 minutes avant ${stamp}.`,
      notes: `Note interne ${stamp}`,
      judge: "Juge e2e",
      visible_to_client: true,
      status: "scheduled",
    },
  ]);
  // Date non visible par le client.
  await admin.from("court_dates").insert({
    matter_id: matter!.id,
    kind: "motion",
    starts_at: new Date(Date.now() + 6 * 86_400_000).toISOString(),
    timezone: "America/Halifax",
    visible_to_client: false,
    status: "scheduled",
  });
  const clientContext = await browser.newContext({ baseURL });
  const page = await clientContext.newPage();
  await page.setExtraHTTPHeaders({ "x-forwarded-for": testIp() });
  try {
    await signInWithMfa(page, client.email, client.password);
    await page.goto("/en/portal/appointments");
    await expect(page.getByRole("heading", { name: "Court dates" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/^Hearing · /)).toBeVisible();
    await expect(page.getByText("Supreme Court of Nova Scotia", { exact: false })).toBeVisible();
    await expect(page.getByText(`Arrivez 30 minutes avant ${stamp}.`)).toBeVisible();
    const join = page.getByRole("link", { name: "Join the virtual hearing" });
    await expect(join).toHaveAttribute("href", "https://meet.example.com/e2e");
    await expect(join).toHaveAttribute("rel", "noopener noreferrer");
    await expect(page.getByText(/^Motion · /)).toHaveCount(0);
    await expect(page.getByText(`Note interne ${stamp}`)).toHaveCount(0);
    await expect(page.getByText("Juge e2e")).toHaveCount(0);
    await expectAccessible(page);
    await page.screenshot({
      path: `.tmp/qa/client-court-dates-${testInfo.project.name}.png`,
      fullPage: true,
    });

    await page.goto(`/fr/portal/matters/${matter!.id}?tab=appointments`);
    await expect(page.getByRole("heading", { name: "Dates de cour" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Consignes de votre avocat")).toBeVisible();
    await expectAccessible(page);
  } finally {
    await clientContext.close();
    await admin.from("court_dates").delete().eq("matter_id", matter!.id);
    await admin.from("matter_access").delete().eq("matter_id", matter!.id);
    await admin.from("matters").delete().eq("id", matter!.id);
    await staff.cleanup();
  }
});
