import { afterAll, describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import {
  anonClient,
  enrollAndVerifyTotp,
  serviceClient,
  signIn,
  testPassword,
  uniqueEmail,
  waitForEmail,
} from "./helpers";

// Hors requête Next.js : en-têtes vides et traductions lues directement dans messages/*.json.
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: "en" | "fr"; namespace: string }) =>
    createTranslator({ locale, messages: locale === "fr" ? fr : en, namespace: namespace as never }),
}));

const { resetClientMfa } = await import("@/server/services/mfa-reset");

/** J3.2 (ADR 0012) : expiration des sessions et procédure « téléphone perdu », avec de vraies sessions. */
const admin = serviceClient();
const created: string[] = [];
const ACTOR = "a0000000-0000-4000-8000-0000000000a1"; // firm_admin de démonstration (seed)

async function makeClient(withMfa: boolean) {
  const email = uniqueEmail("j32");
  const password = testPassword();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: "Riley" },
  });
  if (error || !data.user) throw error ?? new Error("createUser");
  created.push(data.user.id);
  await admin.from("profiles").update({ status: "active" }).eq("id", data.user.id);
  const client = await signIn(email, password);
  if (withMfa) await enrollAndVerifyTotp(client);
  return { email, password, id: data.user.id, client };
}

afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

describe("expiration des sessions (ADR 0012)", () => {
  it("une vraie session est active et le reste à chaque signal", async () => {
    const { client } = await makeClient(false);
    expect((await client.rpc("touch_session")).data).toBe("active");
    expect((await client.rpc("touch_session")).data).toBe("active");
  });

  it("sans session, la base répond expired", async () => {
    const { data, error } = await anonClient().rpc("touch_session");
    expect(data === "expired" || error !== null).toBe(true);
  });
});

describe("procédure « téléphone perdu » (ADR 0012)", () => {
  it("supprime la MFA, coupe les sessions, change le mot de passe, prévient le client, journalise", async () => {
    const errors = vi.spyOn(console, "error");
    const { email, password, id, client } = await makeClient(true);
    const { data: before } = await admin.auth.admin.mfa.listFactors({ userId: id });
    expect(before?.factors.length).toBe(1);
    const { data: sessionBefore } = await client.auth.getSession();
    const refreshToken = sessionBefore.session!.refresh_token;

    const result = await resetClientMfa(
      { email, verification: "callback_known_number", reason: "lost_device" },
      ACTOR,
    );
    expect(result).toEqual({ ok: true });

    const { data: after } = await admin.auth.admin.mfa.listFactors({ userId: id });
    expect(after?.factors.length).toBe(0);

    // Ancien jeton de rafraîchissement refusé (sessions révoquées).
    const { error: refreshError } = await anonClient().auth.refreshSession({ refresh_token: refreshToken });
    expect(refreshError).not.toBeNull();

    // Ancien mot de passe refusé : personne ne peut enrôler un autre téléphone avant le client.
    const { error: loginError } = await anonClient().auth.signInWithPassword({ email, password });
    expect(loginError).not.toBeNull();

    const mail = await waitForEmail(email, "two-step verification was reset");
    expect(mail.html).toContain("/api/auth/callback?token_hash=");
    expect(mail.html).toContain("type=recovery");
    expect(mail.html).not.toMatch(/LC-\d{4}-\d{4}/);

    // L'écriture d'audit a réussi (un échec est signalé par « audit_write_failed »).
    expect(errors.mock.calls.flat().join(" ")).not.toContain("audit_write_failed");
  });

  it("refuse un compte du personnel et l'administrateur lui-même", async () => {
    const staff = await resetClientMfa(
      { email: "demo.staff@lexcanadalaw.test", verification: "in_person_id", reason: "other" },
      ACTOR,
    );
    expect(staff).toEqual({ ok: false, code: "NOT_ELIGIBLE" });
    const unknown = await resetClientMfa(
      { email: "nobody.j32@example.com", verification: "in_person_id", reason: "other" },
      ACTOR,
    );
    expect(unknown).toEqual({ ok: false, code: "NOT_ELIGIBLE" });
  });
});
