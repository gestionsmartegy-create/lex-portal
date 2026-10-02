import { generate } from "otplib";
import { expect, expectAccessible, signInWithPassword, test } from "./fixtures";

test.describe("authentification client (J3, ADR 0011)", () => {
  test("connexion → enrôlement TOTP → portail (RLS) → déconnexion", async ({ page, client }) => {
    await signInWithPassword(page, client.email, client.password);
    await expect(page).toHaveURL(/\/en\/login\/mfa/);
    await expect(page.getByRole("heading", { name: "Secure your account" })).toBeVisible();
    await expectAccessible(page);

    const secret = (await page.locator("code").innerText()).replace(/\s/g, "");
    await page.getByLabel("6-digit code").fill(await generate({ secret }));
    await page.getByRole("button", { name: "Verify" }).click();

    await expect(page).toHaveURL(/\/en\/portal$/);
    await expect(page.getByRole("heading", { name: "Hello Avery" })).toBeVisible();
    await expect(page.getByText("You have 1 matter in your portal.")).toBeVisible();

    await page.getByRole("button", { name: /^sign out$/i }).click();
    await expect(page).toHaveURL(/\/en\/login/);
    await page.goto("/en/portal");
    await expect(page).toHaveURL(/\/en\/login\?next=%2Fen%2Fportal/);
  });

  test("mauvais mot de passe : message neutre", async ({ page, client }) => {
    await signInWithPassword(page, client.email, "Wrong-password-123!");
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
    await signInWithPassword(page, "nobody.e2e@example.com", "Wrong-password-123!");
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  });

  test("adresse du cabinet sur la page client : renvoi vers Microsoft", async ({ page }) => {
    await signInWithPassword(page, "someone@lexcanadalaw.com", "Irrelevant-password-1!");
    await expect(page.getByText("Lex Canada staff accounts sign in with Microsoft.")).toBeVisible();
  });

  test("redirection ouverte refusée après connexion", async ({ page, client }) => {
    await page.goto("/en/login?next=%2F%2Fevil.example%2Fphish");
    await page.getByLabel("Email address").fill(client.email);
    await page.getByLabel("Password", { exact: true }).fill(client.password);
    await page.getByRole("button", { name: /access my portal/i }).click();
    await expect(page).toHaveURL(/\/en\/login\/mfa/);
    expect(new URL(page.url()).host).toBe("localhost:3100");
    expect(page.url()).not.toContain("evil.example");
  });
});

test.describe("pages publiques : accessibilité et en-têtes", () => {
  for (const path of [
    "/en/login",
    "/fr/login",
    "/en/forgot-password",
    "/en/staff/login",
    "/en/does-not-exist",
  ]) {
    test(`axe sans violation grave : ${path}`, async ({ page }) => {
      await page.goto(path);
      await expectAccessible(page);
    });
  }

  test("en-têtes de sécurité de production", async ({ request }) => {
    const res = await request.get("/en/login");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("report-to csp");
    expect(h["content-security-policy-report-only"]).toContain("require-trusted-types-for 'script'");
    expect(h["reporting-endpoints"]).toContain("/api/security/csp-report");
    expect(h["cross-origin-resource-policy"]).toBe("same-origin");
    expect(h["x-frame-options"]).toBe("DENY");
  });

  test("security.txt (RFC 9116)", async ({ request }) => {
    const res = await request.get("/.well-known/security.txt");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("Contact: mailto:admin@lexcanadalaw.com");
    expect(body).toMatch(/Expires: \d{4}-/);
  });

  test("rapport CSP : accepté et vide, type inconnu refusé", async ({ request }) => {
    const ok = await request.post("/api/security/csp-report", {
      headers: { "content-type": "application/csp-report" },
      data: JSON.stringify({
        "csp-report": { "effective-directive": "script-src", "blocked-uri": "inline" },
      }),
    });
    expect(ok.status()).toBe(204);
    const bad = await request.post("/api/security/csp-report", {
      headers: { "content-type": "text/plain" },
      data: "x",
    });
    expect(bad.status()).toBe(415);
  });
});
