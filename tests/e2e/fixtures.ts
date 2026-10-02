import { test as base, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { DEMO_ADMIN, JOHN_MATTER, serviceClient, testPassword, uniqueEmail } from "../integration/helpers";

export type TestClient = { email: string; password: string; id: string };

/**
 * Fixtures e2e : client de test créé par l'API admin de Supabase LOCAL, avec un mot de
 * passe GÉNÉRÉ (jamais affiché ni écrit), supprimé à la fin. Chaque page visitée est
 * surveillée : toute violation CSP dans la console fait échouer le test.
 */
export const test = base.extend<{ client: TestClient; cspViolations: string[] }>({
  cspViolations: [
    async ({ page }, provide) => {
      // Une IP simulée par test (x-forwarded-for, lu à droite avec TRUSTED_PROXY_HOPS=1) :
      // chaque scénario a sa propre limite de débit, sans désactiver la protection.
      const octet = () => Math.floor(Math.random() * 254) + 1;
      await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${octet()}` });
      const violations: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error" && /Content Security Policy|Trusted Type/i.test(msg.text()))
          violations.push(msg.text().slice(0, 200));
      });
      await provide(violations);
      expect(violations, "violations CSP dans la console").toEqual([]);
    },
    { auto: true },
  ],
  client: async ({}, provide) => {
    const admin = serviceClient();
    const email = uniqueEmail("e2e");
    const password = testPassword();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: "Avery" },
    });
    if (error || !data.user) throw error ?? new Error("createUser");
    const id = data.user.id;
    await admin.from("profiles").update({ status: "active", first_name: "Avery" }).eq("id", id);
    await admin
      .from("matter_access")
      .insert({ matter_id: JOHN_MATTER, user_id: id, access_level: "read", granted_by: DEMO_ADMIN });
    await provide({ email, password, id });
    await admin.auth.admin.deleteUser(id);
  },
});

export { expect };

export async function signInWithPassword(page: Page, email: string, password: string) {
  await page.goto("/en/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /access my portal/i }).click();
}

/** Aucune violation d'accessibilité grave ou critique (WCAG 2.2 AA). */
export async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  // Détail utile au diagnostic : sélecteur de l'élément et résumé (contraste mesuré, etc.).
  const details = serious.flatMap((v) =>
    v.nodes.map(
      (n) =>
        `${v.id} · ${n.target.join(" ")} · ${(n.failureSummary ?? "").split("\n").slice(1).join(" ").trim()}`,
    ),
  );
  expect(details).toEqual([]);
}
