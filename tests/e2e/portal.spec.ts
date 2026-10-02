import { DEMO_ADMIN, serviceClient } from "../integration/helpers";
import { expect, expectAccessible, signInWithMfa, test } from "./fixtures";

/** J5 (ADR 0013) : écrans du portail, accès aux dossiers, téléchargement en flux. */
const LEASE = "c0000000-0000-4000-8000-000000000115";
const OTHER_CLIENT_MATTER = "c0000000-0000-4000-8000-000000000098"; // dossier de Jane, jamais accordé ici
const INTERNAL_DOC = "d0000000-0000-4000-8000-000000000005";
const SHARED_DOC = "d0000000-0000-4000-8000-000000000003";

test.describe("portail client", () => {
  test("chaque écran est accessible (axe) et sans violation CSP", async ({ page, client }) => {
    test.setTimeout(120_000);
    await signInWithMfa(page, client.email, client.password);
    for (const path of [
      "/en/portal",
      "/en/portal/matters",
      "/en/portal/matters/c0000000-0000-4000-8000-000000000142",
      "/en/portal/matters/c0000000-0000-4000-8000-000000000142?tab=timeline",
      "/fr/portal/documents",
      "/en/portal/messages",
      "/en/portal/billing",
      "/en/portal/appointments",
      "/en/portal/notifications",
      "/fr/portal/profile",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectAccessible(page);
    }
  });

  test("menu mobile : le tiroir s'ouvre et navigue", async ({ page, client }, info) => {
    test.skip(info.project.name !== "mobile", "tiroir réservé aux petits écrans");
    await signInWithMfa(page, client.email, client.password);
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Billing" }).click();
    await expect(page).toHaveURL(/\/en\/portal\/billing$/);
    await expect(page.getByRole("heading", { level: 1, name: "Billing" })).toBeVisible();
  });

  test("téléchargement en flux, journalisé ; document interne et dossier d'autrui : 404", async ({
    page,
    client,
  }) => {
    await signInWithMfa(page, client.email, client.password);
    const ok = await page.request.get(`/api/documents/${SHARED_DOC}/download`);
    expect(ok.status()).toBe(200);
    expect(ok.headers()["content-type"]).toBe("application/pdf");
    expect(ok.headers()["content-disposition"]).toContain("attachment");
    expect(ok.headers()["cache-control"]).toContain("no-store");
    expect((await ok.body()).subarray(0, 5).toString()).toBe("%PDF-");

    const internal = await page.request.get(`/api/documents/${INTERNAL_DOC}/download`);
    expect(internal.status()).toBe(404);
    const malformed = await page.request.get("/api/documents/not-a-uuid/download");
    expect(malformed.status()).toBe(404);

    await page.goto("/en/portal/documents");
    await expect(page.getByText("Note interne")).toHaveCount(0);

    await page.goto(`/en/portal/matters/${OTHER_CLIENT_MATTER}`);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await page.goto("/en/portal/matters/00000000-0000-4000-8000-000000000000");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });

  test("révocation pendant une session ouverte : accès coupé immédiatement", async ({ page, client }) => {
    const admin = serviceClient();
    await admin
      .from("matter_access")
      .insert({ matter_id: LEASE, user_id: client.id, access_level: "read", granted_by: DEMO_ADMIN });
    await signInWithMfa(page, client.email, client.password);
    await page.goto(`/en/portal/matters/${LEASE}`);
    await expect(page.getByRole("heading", { level: 1, name: "Commercial Lease Review" })).toBeVisible();

    await admin
      .from("matter_access")
      .update({ revoked_at: new Date().toISOString(), revoked_by: DEMO_ADMIN, revoke_reason: "e2e" })
      .eq("matter_id", LEASE)
      .eq("user_id", client.id);

    await page.reload();
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await page.goto("/en/portal/matters");
    await expect(page.getByText("Commercial Lease Review")).toHaveCount(0);
  });

  test("un client en lecture seule ne peut pas répondre", async ({ page, client }) => {
    const admin = serviceClient();
    await admin.from("conversation_participants").insert({
      conversation_id: "e0000000-0000-4000-8000-000000000001",
      user_id: client.id,
    });
    await signInWithMfa(page, client.email, client.password);
    await page.goto("/en/portal/messages/e0000000-0000-4000-8000-000000000001");
    await expect(page.getByText(/read only: you cannot reply here/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toHaveCount(0);
  });
});
