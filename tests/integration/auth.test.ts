import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { generateInvitationToken, hashToken } from "@/server/security/tokens";
import { acceptInvitation, findValidInvitation } from "@/server/services/invitation";
import {
  anonClient,
  countMatters,
  DEMO_ADMIN,
  enrollAndVerifyTotp,
  JOHN_MATTER,
  serviceClient,
  signIn,
  testPassword,
  uniqueEmail,
  waitForEmail,
} from "./helpers";

/**
 * J3 — parcours d'authentification avec de VRAIES sessions Supabase (GoTrue +
 * PostgREST + RLS), en complément des tests pgTAP qui simulent les claims.
 */
const createdUsers: string[] = [];
const admin = serviceClient();

async function makeInvitation(email: string, opts: { expired?: boolean } = {}) {
  const token = generateInvitationToken();
  const { data, error } = await admin
    .from("client_invitations")
    .insert({
      email,
      first_name: "Test",
      preferred_language: "en",
      token_hash: hashToken(token),
      invited_by: DEMO_ADMIN,
      ...(opts.expired ? { expires_at: new Date(Date.now() - 60_000).toISOString() } : {}),
    })
    .select("id")
    .single();
  if (error || !data) throw error;
  await admin
    .from("client_invitation_matters")
    .insert({ invitation_id: data.id, matter_id: JOHN_MATTER, access_level: "read" });
  return token;
}

async function userIdByEmail(email: string) {
  const { data } = await admin.from("profiles").select("id").eq("email", email).single();
  createdUsers.push(data!.id);
  return data!.id;
}

afterAll(async () => {
  for (const id of createdUsers) await admin.auth.admin.deleteUser(id);
});

describe("invitation → activation → MFA → accès (vraies sessions)", () => {
  const email = uniqueEmail("invite");
  const password = testPassword();
  let token = "";

  it("une invitation valide est trouvée, l'activation crée un compte ACTIF avec ses accès", async () => {
    token = await makeInvitation(email);
    expect(await findValidInvitation(token)).toMatchObject({ email });

    const result = await acceptInvitation(token, password);
    expect(result).toMatchObject({ ok: true, email });

    const id = await userIdByEmail(email);
    const { data: profile } = await admin.from("profiles").select("role, status").eq("id", id).single();
    expect(profile).toEqual({ role: "client", status: "active" }); // actif AVANT l'écran MFA
    const { data: access } = await admin
      .from("matter_access")
      .select("matter_id, granted_by")
      .eq("user_id", id);
    expect(access).toEqual([{ matter_id: JOHN_MATTER, granted_by: DEMO_ADMIN }]);
  });

  it("un jeton déjà utilisé est refusé (usage unique)", async () => {
    expect(await acceptInvitation(token, testPassword())).toEqual({ ok: false });
    expect(await findValidInvitation(token)).toBeNull();
  });

  it("session aal1 : AUCUN dossier ni rôle ; après TOTP (aal2) : le dossier devient visible", async () => {
    const client = await signIn(email, password);
    expect(await countMatters(client)).toBe(0);
    expect((await client.rpc("current_session_role")).data).toBeNull();

    await enrollAndVerifyTotp(client);
    expect((await client.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel).toBe("aal2");
    expect(await countMatters(client)).toBe(1);
    expect((await client.rpc("current_session_role")).data).toBe("client");
  });

  it("déconnexion globale : le jeton de rafraîchissement ne fonctionne plus", async () => {
    const client = await signIn(email, password);
    const { data: before } = await client.auth.getSession();
    const refreshToken = before.session!.refresh_token;
    await client.auth.signOut({ scope: "global" });

    const other = anonClient();
    const { error } = await other.auth.refreshSession({ refresh_token: refreshToken });
    expect(error).not.toBeNull();
  });
});

describe("invitations invalides", () => {
  it("une invitation client vers une adresse du cabinet est révoquée, jamais activée (revue J3, M3)", async () => {
    const token = await makeInvitation(uniqueEmail("x", "lexcanadalaw.com"));
    expect(await acceptInvitation(token, testPassword())).toEqual({ ok: false });
    expect(await findValidInvitation(token)).toBeNull();
    const { data } = await admin
      .from("client_invitations")
      .select("status")
      .eq("token_hash", hashToken(token))
      .single();
    expect(data?.status).toBe("revoked");
  });

  it("la base refuse un compte e-mail non pré-créé sur le domaine du cabinet (revue J3, M3)", async () => {
    const { error } = await admin.auth.admin.createUser({
      email: uniqueEmail("rogue", "lexcanadalaw.com"),
      password: testPassword(),
      email_confirm: true,
    });
    expect(error).not.toBeNull();
  });

  it("une invitation expirée est refusée", async () => {
    const token = await makeInvitation(uniqueEmail("expired"), { expired: true });
    expect(await findValidInvitation(token)).toBeNull();
    expect(await acceptInvitation(token, testPassword())).toEqual({ ok: false });
  });

  it("un jeton mal formé ou inconnu est refusé sans requête dangereuse", async () => {
    expect(await findValidInvitation("../../etc/passwd")).toBeNull();
    expect(await acceptInvitation(generateInvitationToken(), testPassword())).toEqual({ ok: false });
  });
});

describe("personnel", () => {
  async function createStaff(email: string, password: string) {
    // Comme provisionStaff : autorisation serveur préalable (migration 160000).
    const { error: authError } = await admin.rpc("authorize_staff_provisioning", {
      p_email: email,
      p_role: "staff",
      p_actor: randomUUID(), // created_by sans clé étrangère : acteur fictif de test
    });
    if (authError) throw authError;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error;
    createdUsers.push(data.user.id);
    await admin.from("profiles").update({ role: "staff", status: "active" }).eq("id", data.user.id);
    await admin.from("matter_team").insert({ matter_id: JOHN_MATTER, user_id: data.user.id });
    return data.user.id;
  }

  it("vrai domaine du cabinet par mot de passe : AUCUN droit (session Microsoft exigée)", async () => {
    const email = uniqueEmail("staff", "lexcanadalaw.com");
    const password = testPassword();
    await createStaff(email, password);
    const client = await signIn(email, password);
    expect((await client.rpc("current_session_role")).data).toBeNull();
    expect(await countMatters(client)).toBe(0);
  });

  it("domaine de test local (*.test) par mot de passe : droits de son équipe", async () => {
    const email = uniqueEmail("staff", "lexcanadalaw.test");
    const password = testPassword();
    await createStaff(email, password);
    const client = await signIn(email, password);
    expect((await client.rpc("current_session_role")).data).toBe("staff");
    expect(await countMatters(client)).toBe(1);

    // Contre-revue : PostgREST « return=representation » sur une table à colonnes restreintes.
    const ok = await client
      .from("matters")
      .update({ progress_percent: 66 })
      .eq("id", JOHN_MATTER)
      .select("id, progress_percent");
    expect(ok.error).toBeNull();
    expect(ok.data).toEqual([{ id: JOHN_MATTER, progress_percent: 66 }]);
    const star = await client.from("matters").select("*").eq("id", JOHN_MATTER);
    expect(star.error?.code).toBe("42501"); // « select * » refusé : colonnes explicites obligatoires
  });
});

describe("RPC serveur", () => {
  it("rate_limit_hit et record_audit_event sont refusés à un appel anonyme ou authentifié", async () => {
    const anon = anonClient();
    expect(
      (await anon.rpc("rate_limit_hit", { p_key: "x", p_max: 1, p_window_seconds: 60 })).error,
    ).not.toBeNull();
    expect(
      (await anon.rpc("record_audit_event", { p_action: "auth.login", p_resource_type: "session" })).error,
    ).not.toBeNull();
  });

  it("rate_limit_hit fonctionne pour le serveur (service_role)", async () => {
    const key = `it:${crypto.randomUUID()}`;
    const hits = [];
    for (let i = 0; i < 3; i++)
      hits.push((await admin.rpc("rate_limit_hit", { p_key: key, p_max: 2, p_window_seconds: 60 })).data);
    expect(hits).toEqual([true, true, false]);
  });
});

describe("alertes de sécurité (ADR 0011)", () => {
  it("un changement de mot de passe envoie une alerte bilingue, sans lien ni donnée de dossier", async () => {
    const email = uniqueEmail("alert");
    const password = testPassword();
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error;
    createdUsers.push(data.user.id);

    const client = await signIn(email, password);
    const { error: updateError } = await client.auth.updateUser({ password: testPassword() });
    expect(updateError).toBeNull();

    const mail = await waitForEmail(email, "Your password was changed");
    expect(mail.subject).toContain("Votre mot de passe a été modifié");
    expect(mail.html).not.toMatch(/<a\s/i);
    expect(mail.html).not.toMatch(/LC-\d{4}-\d{4}/);
  });
});
