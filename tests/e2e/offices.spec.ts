import { serviceClient } from "../integration/helpers";
import { createStaffSession, expect, expectAccessible, test } from "./fixtures";

/** Bureaux et tribunaux (ADR 0024) : gestion, personnel par bureau, bureau d'un dossier, filtre. */
test("bureaux : création, archivage, personnel, bureau d'un dossier et filtre du portefeuille", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.setTimeout(180_000);
  const admin = serviceClient();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const staff = await createStaffSession(context, baseURL!, "firm_admin");
  const officeName = `Bureau e2e ${stamp}`;
  const courtName = `Tribunal e2e ${stamp}`;
  const { data: matter } = await admin
    .from("matters")
    .insert({
      display_number: `E2E-OFF-${stamp}`,
      title: `Dossier bureau ${stamp}`,
      status: "open",
      is_mock: true,
    })
    .select("id, title")
    .single();
  const { data: halifax } = await admin.from("offices").select("id").eq("name_en", "Halifax").single();
  const shot = (name: string) =>
    page.screenshot({ path: `.tmp/qa/${name}-${testInfo.project.name}.png`, fullPage: true });

  try {
    await page.goto("/en/admin/offices");
    await expect(page.getByRole("heading", { name: "Offices & courts", level: 1 })).toBeVisible();
    for (const city of ["Ottawa", "Halifax", "Montreal"])
      await expect(page.getByText(city, { exact: true }).first()).toBeVisible();
    await expectAccessible(page);
    await shot("offices");

    // Création d'un bureau, puis archivage.
    await page.getByText("Add an office").click();
    const add = page.locator("form", { has: page.locator("#o-new-fr") });
    await add.getByLabel("Name (French)").fill(officeName);
    await add.getByLabel("Name (English)").fill(officeName);
    await add.getByLabel("City").fill("Moncton");
    await add.getByLabel("Province").selectOption("NB");
    await add.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText("Saved.", { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: `Archive : ${officeName}` }).click();
    await expect(page.getByText(/Archived: no longer offered/)).toBeVisible({ timeout: 15_000 });

    // Nom en double refusé.
    await page.getByText("Add an office").click();
    await add.getByLabel("Name (French)").fill("Ottawa");
    await add.getByLabel("Name (English)").fill(`Autre ${stamp}`);
    await add.getByLabel("City").fill("Ottawa");
    await add.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText("This name is already used.")).toBeVisible({ timeout: 15_000 });

    // Tribunal.
    await page.getByText("Add a court").click();
    const court = page.locator("form", { has: page.locator("#c-new-fr") });
    await court.getByLabel("Name (French)").fill(courtName);
    await court.getByLabel("Name (English)").fill(courtName);
    await court.getByLabel("Jurisdiction").selectOption("QC");
    await court.getByLabel("Time zone").selectOption("America/Toronto");
    await court.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText("Saved.", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(courtName, { exact: true })).toBeVisible();

    // Bureau principal du membre du personnel connecté.
    const row = page.locator("li", { has: page.locator(`#sp-${staff.id}`) });
    await row.locator(`#sp-${staff.id}`).selectOption(halifax!.id);
    await row.getByRole("button", { name: /^Save :/ }).click();
    await expect(page.getByText("Saved.", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(
        async () =>
          (await admin.from("staff_offices").select("office_id, is_primary").eq("user_id", staff.id)).data,
        { timeout: 15_000 },
      )
      .toEqual([{ office_id: halifax!.id, is_primary: true }]);

    // Adjoint·e : accès à tout le calendrier de cour, puis retrait.
    const viewerRow = page
      .locator("li", { has: page.getByRole("button", { name: /whole firm : |Remove access : / }) })
      .filter({ has: page.locator(`input[name="userId"][value="${staff.id}"]`) });
    await viewerRow.getByRole("button", { name: /Give access to the whole firm/ }).click();
    await expect(page.getByText("Saved.", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(
        async () =>
          (await admin.from("court_calendar_viewers").select("user_id").eq("user_id", staff.id)).data?.length,
        { timeout: 15_000 },
      )
      .toBe(1);
    await page
      .locator("li")
      .filter({ has: page.locator(`input[name="userId"][value="${staff.id}"]`) })
      .getByRole("button", { name: /Remove access/ })
      .click();
    await expect
      .poll(
        async () =>
          (await admin.from("court_calendar_viewers").select("user_id").eq("user_id", staff.id)).data?.length,
        { timeout: 15_000 },
      )
      .toBe(0);

    // Bureau du dossier, puis filtre du portefeuille.
    await page.goto(`/en/admin/matters/${matter!.id}?tab=details`);
    await page.getByLabel("Office", { exact: true }).selectOption(halifax!.id);
    await page.getByRole("button", { name: "Save the office" }).click();
    await expect(page.getByText("Office saved.")).toBeVisible({ timeout: 15_000 });
    await expectAccessible(page);
    await page.goto(`/en/admin/matters?office=${halifax!.id}&q=${stamp}`);
    await expect(page.getByText(matter!.title)).toBeVisible({ timeout: 15_000 });
    await page.goto(`/fr/admin/offices`);
    await expect(page.getByRole("heading", { name: "Bureaux et tribunaux", level: 1 })).toBeVisible();
  } finally {
    await admin.from("matters").update({ office_id: null }).eq("id", matter!.id);
    await admin.from("matters").delete().eq("id", matter!.id);
    await admin.from("staff_offices").delete().eq("user_id", staff.id);
    await admin.from("offices").delete().like("name_en", `%${stamp}`);
    await admin.from("courts").delete().eq("name_en", courtName);
    await staff.cleanup();
  }
});

/** Le personnel (non administrateur) n'a pas accès à la gestion des bureaux : même réponse « introuvable ». */
test("bureaux : page réservée au firm_admin", async ({ page, context, baseURL }) => {
  const staff = await createStaffSession(context, baseURL!, "staff");
  try {
    const response = await page.goto("/en/admin/offices");
    expect(response?.status()).toBe(404);
  } finally {
    await staff.cleanup();
  }
});
