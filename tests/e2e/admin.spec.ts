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
        "/en/admin/messages",
        "/en/admin/messages?filter=all",
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
    // Nom unique : d'autres clients de test « Avery » peuvent avoir accès au même dossier.
    const marker = `Grant${Date.now()}`;
    await serviceClient().from("profiles").update({ last_name: marker }).eq("id", client.id);
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
      const row = page.getByRole("listitem").filter({ hasText: marker });
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

      // Sans rechargement : la liste « Invitations envoyées » montre aussitôt la nouvelle invitation.
      const row = page.getByRole("listitem").filter({ hasText: email });
      await expect(row).toBeVisible();
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

  test("messagerie : le cabinet écrit, le client lit et est averti ; fil clos", async ({
    browser,
    page,
    context,
    baseURL,
    client,
  }) => {
    test.setTimeout(180_000);
    const staff = await createStaffSession(context, baseURL!, "firm_admin");
    const subject = `Suivi e2e ${Date.now()}`;
    try {
      await page.goto("/en/admin/messages");
      await page
        .getByLabel("Matter")
        .selectOption({ label: "LC-2026-0142 — Permanent Residency Application" });
      await page.getByLabel("Subject").fill(subject);
      await page.getByLabel("Message", { exact: true }).fill("Please review the updated form.");
      await page.getByRole("button", { name: "Send the message" }).click();
      await expect(page.getByRole("heading", { level: 1, name: subject })).toBeVisible();
      await expectAccessible(page);

      const clientContext = await browser.newContext({ baseURL });
      const clientPage = await clientContext.newPage();
      await clientPage.setExtraHTTPHeaders({ "x-forwarded-for": testIp() });
      await signInWithMfa(clientPage, client.email, client.password);
      await clientPage.goto("/en/portal/notifications");
      await expect(clientPage.getByText("New message").first()).toBeVisible();
      await clientPage.goto("/en/portal/messages");
      await clientPage.getByRole("link", { name: new RegExp(subject) }).click();
      await expect(clientPage.getByText("Please review the updated form.")).toBeVisible();
      const mail = await waitForEmail(client.email, "new message");
      expect(mail.text).not.toContain("Please review the updated form.");

      await page.getByRole("button", { name: "Close the conversation" }).click();
      await expect(page.getByText("The conversation was closed.")).toBeVisible();
      await clientPage.reload();
      await expect(clientPage.getByText("This conversation is closed.")).toBeVisible();
      await clientContext.close();
    } finally {
      await staff.cleanup();
    }
  });

  test("client en lecture et réponse : peut ouvrir une nouvelle conversation (régression B6)", async ({
    page,
    client,
  }) => {
    const admin = serviceClient();
    await admin.from("matter_access").insert({
      matter_id: LEASE,
      user_id: client.id,
      access_level: "read_write",
      granted_by: "a0000000-0000-4000-8000-0000000000a1",
    });
    await signInWithMfa(page, client.email, client.password);
    await page.goto(`/en/portal/matters/${LEASE}?tab=messages`);
    await page.getByLabel("Subject").fill("Question from e2e");
    await page.getByLabel("Your message").fill("Hello, I have a question.");
    await page.getByRole("button", { name: "Start the conversation" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Question from e2e" })).toBeVisible();
    await expect(page.getByText("Hello, I have a question.")).toBeVisible();
  });
});
