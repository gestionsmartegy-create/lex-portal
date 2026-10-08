import { serviceClient } from "../integration/helpers";
import { createStaffSession, expect, expectAccessible, test } from "./fixtures";

/** Assistant d'ouverture d'un dossier (ADR 0020) : tout est appliqué en une fois. */
test("ouverture d'un dossier : type, étapes, équipe, client, document demandé, livrable", async ({
  page,
  context,
  baseURL,
  client,
}) => {
  test.setTimeout(180_000);
  const admin = serviceClient();
  const number = `E2E-OPEN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const { data: matter } = await admin
    .from("matters")
    .insert({ display_number: number, title: "Dossier e2e (ouverture)", status: "open", is_mock: true })
    .select("id")
    .single();
  const staff = await createStaffSession(context, baseURL!, "firm_admin");
  try {
    await page.goto("/en/admin/matters");
    await page.getByRole("link", { name: "Set up a matter" }).click();
    await page
      .getByLabel("Matter (from Clio)")
      .selectOption({ label: `${number} — Dossier e2e (ouverture)` });
    await page
      .getByLabel("Matter type")
      .selectOption({ label: "Immigration — Permanent Residence (Express Entry, PNP)" });
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "2. Steps" })).toBeVisible();
    await expectAccessible(page);

    await page.getByLabel("Responsible lawyer").selectOption({ label: "Wilson Saintelmy" });
    await page.getByLabel("Client (existing account)").selectOption({ value: client.id });
    await page.getByLabel("Valid passport (all pages)").check();
    await page.getByLabel("Deliverable 1").fill("Avis juridique e2e");
    await page.getByRole("button", { name: "Set up the matter" }).click();

    await expect(page).toHaveURL(new RegExp(`/en/admin/matters/${matter!.id}\\?notice=opened`), {
      timeout: 30_000,
    });
    await expect(page.getByText("Matter set up: everything is in place.")).toBeVisible();

    await page.goto(`/en/admin/matters/${matter!.id}?tab=steps`);
    await expect(page.getByRole("listitem").filter({ hasText: "Invitation to apply" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Avis juridique e2e" })).toBeVisible();
    await page.goto(`/en/admin/matters/${matter!.id}?tab=documents`);
    await expect(page.getByText("Valid passport (all pages)").first()).toBeVisible();
    await page.goto(`/en/admin/matters/${matter!.id}?tab=team`);
    await expect(page.getByText("Wilson Saintelmy").first()).toBeVisible();
  } finally {
    await admin.from("document_requests").delete().eq("matter_id", matter!.id);
    await admin.from("matter_access").delete().eq("matter_id", matter!.id);
    await admin.from("matter_team").delete().eq("matter_id", matter!.id);
    await admin.from("notifications").delete().eq("matter_id", matter!.id);
    await admin.from("matters").delete().eq("id", matter!.id);
    await staff.cleanup();
  }
});

test("mise en place d'un dossier : réservée au firm_admin (404 pour le personnel)", async ({
  page,
  context,
  baseURL,
}) => {
  const staff = await createStaffSession(context, baseURL!, "staff");
  try {
    const res = await page.goto("/en/admin/matters/new");
    expect(res?.status()).toBe(404);
    await page.goto("/en/admin/matters");
    await expect(page.getByRole("link", { name: "Set up a matter" })).toHaveCount(0);
  } finally {
    await staff.cleanup();
  }
});
