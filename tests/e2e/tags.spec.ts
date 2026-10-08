import { serviceClient } from "../integration/helpers";
import { createStaffSession, expect, expectAccessible, signInWithMfa, test, testIp } from "./fixtures";

/** Étiquettes et portefeuille (ADR 0021) : pose, filtre, visibilité pour le client. */
test("étiquettes : posées sur un dossier, filtre du portefeuille, seule l'étiquette visible chez le client", async ({
  browser,
  page,
  context,
  baseURL,
  client,
}) => {
  test.setTimeout(180_000);
  const admin = serviceClient();
  // Dossier fictif propre à cette exécution, avec le client du test (lecture).
  const number = `E2E-TAG-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const { data: matter } = await admin
    .from("matters")
    .insert({ display_number: number, title: "Dossier e2e (étiquettes)", status: "open", is_mock: true })
    .select("id")
    .single();
  const staff = await createStaffSession(context, baseURL!, "firm_admin");
  await admin
    .from("matter_access")
    .insert({ matter_id: matter!.id, user_id: client.id, access_level: "read", granted_by: staff.id });
  try {
    await page.goto(`/en/admin/matters/${matter!.id}?tab=details`);
    await page.getByLabel("Urgent").check();
    await page.getByLabel("File complete").check();
    await page.getByRole("button", { name: "Save the tags" }).click();
    await expect(page.getByText("Tags saved.")).toBeVisible({ timeout: 15_000 });
    await expectAccessible(page);

    await page.goto("/en/admin/matters");
    await page.getByLabel("Tag", { exact: true }).selectOption({ label: "Urgent" });
    await page.getByLabel("Search (title or number)").fill(number);
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page.getByText("Dossier e2e (étiquettes)")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("1 matter", { exact: true })).toBeVisible();
    await expectAccessible(page);

    const clientContext = await browser.newContext({ baseURL });
    const clientPage = await clientContext.newPage();
    await clientPage.setExtraHTTPHeaders({ "x-forwarded-for": testIp() });
    await signInWithMfa(clientPage, client.email, client.password);
    await clientPage.goto(`/en/portal/matters/${matter!.id}`);
    await expect(clientPage.getByText("File complete", { exact: true })).toBeVisible();
    await expect(clientPage.getByText("Urgent", { exact: true })).toHaveCount(0);
    await clientContext.close();
  } finally {
    await admin.from("matter_tag_links").delete().eq("matter_id", matter!.id);
    await admin.from("matter_access").delete().eq("matter_id", matter!.id);
    await admin.from("matters").delete().eq("id", matter!.id);
    await staff.cleanup();
  }
});
