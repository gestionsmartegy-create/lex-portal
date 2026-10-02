import { serviceClient, waitForEmail } from "../integration/helpers";
import { createStaffSession, expect, expectAccessible, signInWithMfa, test, testIp } from "./fixtures";

/** Espace cabinet (J5, ADR 0013) : pages, octroi et révocation, rôles. */
const LEASE = "c0000000-0000-4000-8000-000000000115";

test.describe("espace cabinet", () => {
  test("firm_admin : chaque écran est accessible (axe) et sans violation CSP", async ({
    page,
    context,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const staff = await createStaffSession(context, baseURL!, "firm_admin");
    try {
      for (const path of [
        "/en/admin",
        "/en/admin/clients",
        "/fr/admin/invitations",
        "/en/admin/matters",
        `/en/admin/matters/${LEASE}/access`,
        "/en/admin/audit",
        "/en/admin/staff",
        "/fr/admin/security/mfa-reset",
        "/en/admin/integrations",
      ]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expectAccessible(page);
      }
    } finally {
      await staff.cleanup();
    }
  });

  test("octroi puis révocation : le client voit puis perd le dossier", async ({
    browser,
    page,
    context,
    baseURL,
    client,
  }) => {
    test.setTimeout(120_000);
    const staff = await createStaffSession(context, baseURL!, "firm_admin");
    try {
      await page.goto(`/en/admin/matters/${LEASE}/access`);
      await page.getByLabel("Client email (existing account)").fill(client.email);
      await page.getByRole("button", { name: "Grant access" }).last().click();
      await expect(page.getByText("Access granted.")).toBeVisible();

      const clientContext = await browser.newContext({ baseURL });
      const clientPage = await clientContext.newPage();
      await clientPage.setExtraHTTPHeaders({ "x-forwarded-for": testIp() });
      await signInWithMfa(clientPage, client.email, client.password);
      await clientPage.goto(`/en/portal/matters/${LEASE}`);
      await expect(
        clientPage.getByRole("heading", { level: 1, name: "Commercial Lease Review" }),
      ).toBeVisible();

      await page.reload();
      // Plusieurs clients ont accès au dossier : on cible la ligne du client de test.
      const row = page.getByRole("listitem").filter({ hasText: "Avery" });
      await row.getByLabel("Reason for revocation").fill("End of mandate (e2e)");
      await row.getByRole("button", { name: "Revoke" }).click();
      await expect(page.getByText("Access revoked")).toBeVisible();

      await clientPage.reload();
      await expect(clientPage.getByRole("heading", { name: "Page not found" })).toBeVisible();
      await clientContext.close();
    } finally {
      await staff.cleanup();
    }
  });

  test("invitation : envoyée, e-mail reçu, puis révoquée", async ({ page, context, baseURL }) => {
    const staff = await createStaffSession(context, baseURL!, "firm_admin");
    const email = `invite.${Date.now()}@example.com`;
    try {
      await page.goto("/en/admin/invitations");
      await page.getByLabel("Email address").fill(email);
      await page.getByRole("checkbox").first().check();
      await page.getByRole("button", { name: "Send invitation" }).click();
      await expect(page.getByText("Invitation sent.")).toBeVisible();
      const mail = await waitForEmail(email, "invitation");
      expect(mail.html).toContain("/invite/");

      await page.reload();
      const row = page.getByRole("listitem").filter({ hasText: email });
      await row.getByRole("button", { name: "Revoke" }).click();
      await expect(page.getByText("The invitation was revoked.")).toBeVisible();
    } finally {
      await staff.cleanup();
    }
  });

  test("rôles : le personnel n'a pas les écrans d'administration ; un client n'a pas l'espace cabinet", async ({
    browser,
    page,
    context,
    baseURL,
    client,
  }) => {
    const staff = await createStaffSession(context, baseURL!, "staff");
    try {
      await page.goto("/en/admin");
      await expect(page.getByRole("heading", { level: 1, name: "Firm workspace" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Clients" })).toHaveCount(0);
      await page.goto("/en/admin/clients");
      await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
      await page.goto("/en/admin/audit");
      await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    } finally {
      await staff.cleanup();
    }
    const clientContext = await browser.newContext({ baseURL });
    const clientPage = await clientContext.newPage();
    await clientPage.setExtraHTTPHeaders({ "x-forwarded-for": testIp() });
    await signInWithMfa(clientPage, client.email, client.password);
    await clientPage.goto("/en/admin");
    await expect(clientPage.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await clientContext.close();
  });

  test("intégrations : import depuis le faux Clio, sans accès accordé", async ({
    page,
    context,
    baseURL,
  }) => {
    const staff = await createStaffSession(context, baseURL!, "firm_admin");
    try {
      await page.goto("/en/admin/integrations");
      await expect(page.getByText(/Demonstration mode/)).toBeVisible();
      await page.getByLabel("Client email in Clio").fill("legal@northwind.example.com");
      await page.getByRole("button", { name: "Import" }).click();
      await expect(page.getByText("1 matter and no invoice imported.")).toBeVisible();
      await page.goto("/en/admin/matters");
      await expect(page.getByText("Shareholder Agreement")).toBeVisible();
    } finally {
      const admin = serviceClient();
      await admin.from("matters").delete().eq("clio_matter_id", "7700002");
      await staff.cleanup();
    }
  });
});
