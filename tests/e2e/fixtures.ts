import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { generate } from "otplib";
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
      await page.setExtraHTTPHeaders({ "x-forwarded-for": testIp() });
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
  // L'audit porte sur l'état au repos : un bouton resté survolé après un clic n'est pas représentatif.
  await page.mouse.move(0, 0);
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

/** Connexion complète : mot de passe, enrôlement TOTP (clé affichée), arrivée sur le portail. */
export async function signInWithMfa(page: Page, email: string, password: string) {
  await signInWithPassword(page, email, password);
  await page.waitForURL(/\/login\/mfa/);
  const secret = (await page.locator("code").innerText()).replace(/\s/g, "");
  await page.getByLabel("6-digit code").fill(await generate({ secret }));
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL(/\/en\/portal$/);
}

/**
 * Personnel de TEST (domaine *.test, mot de passe autorisé en local uniquement, ADR 0009) :
 * le build de production n'affiche pas le formulaire de démonstration, donc la session est
 * ouverte par @supabase/ssr lui-même (mêmes cookies que l'application), puis posée dans le
 * navigateur. Compte créé par l'autorisation de pré-création, mot de passe généré, supprimé à la fin.
 */
export async function createStaffSession(
  context: BrowserContext,
  baseURL: string,
  role: "staff" | "firm_admin",
) {
  const { createServerClient } = await import("@supabase/ssr");
  const admin = serviceClient();
  const email = uniqueEmail(`e2e-${role}`, "lexcanadalaw.test");
  const password = testPassword();
  await admin.rpc("authorize_staff_provisioning", { p_email: email, p_role: role, p_actor: DEMO_ADMIN });
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: "Morgan", last_name: "Test" },
  });
  if (error || !data.user) throw error ?? new Error("createUser staff");
  await admin.from("profiles").update({ first_name: "Morgan", last_name: "Test" }).eq("id", data.user.id);

  const jar: { name: string; value: string }[] = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => jar,
        setAll: (items) => {
          for (const { name, value } of items) {
            const i = jar.findIndex((c) => c.name === name);
            if (i >= 0) jar.splice(i, 1);
            if (value) jar.push({ name, value });
          }
        },
      },
    },
  );
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  const url = new URL(baseURL);
  await context.addCookies(
    jar.map((c) => ({
      name: c.name,
      value: c.value,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax" as const,
    })),
  );
  return { id: data.user.id, email, cleanup: () => admin.auth.admin.deleteUser(data.user!.id) };
}

/** IP de test (TEST-NET-3) aléatoire : chaque contexte a sa propre limite de débit. */
export function testIp(): string {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  return `203.0.113.${octet()}`;
}
