"use server";

import "server-only";
import { redirect } from "next/navigation";
import { isDemoStaffEmail, isStaffEmail } from "@/lib/auth-constants";
import { toBrowserAuthorizeUrl } from "@/lib/oauth-authorize-url";
import { safeNextPath } from "@/lib/safe-redirect";
import { getAssurance, getSessionRole, getUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { serverEnv } from "@/server/env";
import { getRequestContext } from "@/server/security/request-context";
import { checkRateLimit, hitRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import { hashForKey } from "@/server/security/tokens";
import { staffDemoLoginEnabled } from "@/server/auth/demo-login";
import { recordAudit } from "@/server/services/audit";
import { TIMEOUT_REASON } from "@/lib/session-timeout";
import { acceptInvitation } from "@/server/services/invitation";
import {
  acceptInvitationSchema,
  type AuthErrorCode,
  forgotPasswordSchema,
  loginSchema,
  newPasswordSchema,
  totpCodeSchema,
} from "@/server/validation/auth";

export type ActionState = { error?: AuthErrorCode; ok?: boolean };

const fields = (formData: FormData) => Object.fromEntries(formData.entries());

async function ipKey(prefix: string) {
  const { ip } = await getRequestContext();
  return `${prefix}:ip:${ip ?? "unknown"}`;
}

/** Après une connexion réussie : portail client si la session est complète, sinon MFA. */
async function routeAfterLogin(locale: string, next?: string): Promise<never> {
  const role = await getSessionRole();
  if (role === "client") redirect(safeNextPath(next, locale));
  if (role === "staff" || role === "firm_admin") redirect(`/${locale}/admin`);
  const mfaPath = `/${locale}/login/mfa`;
  redirect(next ? `${mfaPath}?next=${encodeURIComponent(next)}` : mfaPath);
}

// ---------------------------------------------------------------------------
// Connexion client (e-mail + mot de passe → MFA obligatoire)
// ---------------------------------------------------------------------------
export async function loginAction(_prev: unknown, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: "INVALID_CREDENTIALS" };
  const { email, password, locale, next } = parsed.data;

  // Par IP : chaque essai compte. Par compte : seuls les ÉCHECS comptent (revue J3, F3),
  // pour qu'un tiers ne puisse pas bloquer un client en connaissant seulement son e-mail.
  const accountKey = `login:acct:${hashForKey(email)}`;
  if (
    !(await hitRateLimit(await ipKey("login"), RATE_LIMITS.loginByIp)) ||
    !(await checkRateLimit(accountKey, RATE_LIMITS.loginByAccount))
  ) {
    return { error: "RATE_LIMITED" };
  }
  // Le personnel n'a AUCUN droit par mot de passe (ADR 0009) : on l'oriente vers Microsoft.
  if (isStaffEmail(email)) return { error: "STAFF_USE_MICROSOFT" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    await hitRateLimit(accountKey, RATE_LIMITS.loginByAccount);
    await recordAudit({
      action: "auth.login_failed",
      resourceType: "session",
      metadata: { reason: "credentials", account: hashForKey(email) }, // empreinte, jamais l'e-mail
    });
    return { error: "INVALID_CREDENTIALS" }; // message neutre : n'indique jamais si le compte existe
  }
  return routeAfterLogin(locale, next);
}

// ---------------------------------------------------------------------------
// MFA TOTP : enrôlement (premier passage) ou vérification
// ---------------------------------------------------------------------------
export async function verifyMfaAction(_prev: unknown, formData: FormData): Promise<ActionState> {
  const parsed = totpCodeSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: "CODE_INVALID" };
  const { code, factorId, locale, next } = parsed.data;

  const user = await getUser();
  if (!user) redirect(`/${locale}/login`);
  if (!(await hitRateLimit(`mfa:user:${user.id}`, RATE_LIMITS.mfaByUser))) return { error: "RATE_LIMITED" };

  const supabase = await createSupabaseServerClient();
  const wasEnrolled = (await getAssurance()).hasVerifiedFactor;
  const id =
    factorId ?? (await supabase.auth.mfa.listFactors()).data?.totp?.find((f) => f.status === "verified")?.id;
  if (!id) return { error: "CODE_INVALID" };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code });
  if (error) {
    await recordAudit({ action: "auth.mfa_failed", resourceType: "session", actorId: user.id });
    return { error: "CODE_INVALID" };
  }
  if (!wasEnrolled)
    await recordAudit({
      action: "auth.mfa_enrolled",
      resourceType: "profile",
      resourceId: user.id,
      actorId: user.id,
    });
  await recordAudit({
    action: "auth.login",
    resourceType: "session",
    actorId: user.id,
    metadata: { method: "totp" },
  });
  return routeAfterLogin(locale, next);
}

// ---------------------------------------------------------------------------
// Mot de passe oublié / nouveau mot de passe
// ---------------------------------------------------------------------------
export async function forgotPasswordAction(_prev: unknown, formData: FormData): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse(fields(formData));
  // Réponse identique dans tous les cas : aucune énumération de comptes.
  if (!parsed.success) return { ok: true };
  const { email, locale } = parsed.data;
  if (!(await hitRateLimit(await ipKey("reset"), RATE_LIMITS.passwordResetByIp)))
    return { error: "RATE_LIMITED" };
  if (isStaffEmail(email)) return { ok: true }; // le personnel gère son mot de passe chez Microsoft

  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${serverEnv().APP_BASE_URL}/api/auth/callback?next=${encodeURIComponent(`/${locale}/reset-password`)}`,
  });
  await recordAudit({ action: "auth.password_reset_requested", resourceType: "session" });
  return { ok: true };
}

export async function updatePasswordAction(_prev: unknown, formData: FormData): Promise<ActionState> {
  const parsed = newPasswordSchema.safeParse(fields(formData));
  if (!parsed.success) {
    const code = parsed.error.issues[0]?.message;
    return { error: code === "PASSWORD_MISMATCH" ? "PASSWORD_MISMATCH" : "PASSWORD_WEAK" };
  }
  const { password, locale } = parsed.data;
  const user = await getUser();
  if (!user) redirect(`/${locale}/login`);

  // Un compte avec MFA doit d'abord repasser son code (aal2) pour changer de mot de passe.
  const assurance = await getAssurance();
  if (assurance.hasVerifiedFactor && assurance.current !== "aal2") {
    redirect(`/${locale}/login/mfa?next=${encodeURIComponent(`/${locale}/reset-password`)}`);
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.code === "weak_password" ? "PASSWORD_WEAK" : "UNEXPECTED" };
  await recordAudit({
    action: "auth.password_changed",
    resourceType: "profile",
    resourceId: user.id,
    actorId: user.id,
  });
  return routeAfterLogin(locale);
}

// ---------------------------------------------------------------------------
// Activation d'une invitation
// ---------------------------------------------------------------------------
export async function acceptInvitationAction(_prev: unknown, formData: FormData): Promise<ActionState> {
  const parsed = acceptInvitationSchema.safeParse(fields(formData));
  if (!parsed.success) {
    const code = parsed.error.issues[0]?.message;
    if (code === "PASSWORD_MISMATCH") return { error: "PASSWORD_MISMATCH" };
    if (code === "TOKEN_INVALID") return { error: "INVITATION_INVALID" };
    return { error: "PASSWORD_WEAK" };
  }
  if (!(await hitRateLimit(await ipKey("invite"), RATE_LIMITS.invitationAcceptByIp)))
    return { error: "RATE_LIMITED" };

  const result = await acceptInvitation(parsed.data.token, parsed.data.password);
  if (!result.ok) return { error: "INVITATION_INVALID" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: result.email,
    password: parsed.data.password,
  });
  if (error) redirect(`/${result.locale}/login`);
  redirect(`/${result.locale}/login/mfa`); // enrôlement MFA obligatoire avant tout accès
}

// ---------------------------------------------------------------------------
// Personnel : Microsoft (désactivé tant qu'Azure n'est pas configuré) et démo locale
// ---------------------------------------------------------------------------
export async function staffMicrosoftAction(formData: FormData): Promise<void> {
  const locale = formData.get("locale") === "fr" ? "fr" : "en";
  if (process.env.NEXT_PUBLIC_STAFF_SSO_ENABLED !== "true") redirect(`/${locale}/staff/login`);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      redirectTo: `${serverEnv().APP_BASE_URL}/api/auth/callback?next=${encodeURIComponent(`/${locale}/admin`)}`,
      scopes: "openid email profile",
    },
  });
  if (error || !data.url) redirect(`/${locale}/staff/login`);
  const env = serverEnv();
  const target = toBrowserAuthorizeUrl(data.url, env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_PUBLIC_URL);
  if (!target) redirect(`/${locale}/staff/login`);
  redirect(target);
}

/** Formulaire de démonstration : développement ou serveur de test (ADR 0016), comptes *.test uniquement. */
export async function staffDemoLoginAction(_prev: unknown, formData: FormData): Promise<ActionState> {
  if (!staffDemoLoginEnabled()) return { error: "UNEXPECTED" };
  const parsed = loginSchema.safeParse(fields(formData));
  if (!parsed.success || !isDemoStaffEmail(parsed.data.email)) return { error: "INVALID_CREDENTIALS" };
  if (!(await hitRateLimit(await ipKey("login"), RATE_LIMITS.loginByIp))) return { error: "RATE_LIMITED" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { error: "INVALID_CREDENTIALS" };
  const role = await getSessionRole();
  if (role !== "staff" && role !== "firm_admin") {
    await supabase.auth.signOut();
    return { error: "INVALID_CREDENTIALS" };
  }
  await recordAudit({ action: "auth.login", resourceType: "session", metadata: { method: "demo_password" } });
  redirect(`/${parsed.data.locale}/admin`);
}

// ---------------------------------------------------------------------------
// Déconnexion
// ---------------------------------------------------------------------------
export async function logoutAction(formData: FormData): Promise<void> {
  const locale = formData.get("locale") === "fr" ? "fr" : "en";
  const everywhere = formData.get("scope") === "global";
  const supabase = await createSupabaseServerClient();
  const user = await getUser();
  await supabase.auth.signOut({ scope: everywhere ? "global" : "local" });
  if (user) {
    await recordAudit({
      action: everywhere ? "auth.logout_all" : "auth.logout",
      resourceType: "session",
      actorId: user.id,
    });
  }
  redirect(everywhere ? `/${locale}/login?signedOut=all` : `/${locale}/login`);
}

// ---------------------------------------------------------------------------
// Expiration de session (ADR 0012)
// ---------------------------------------------------------------------------
export type KeepAliveState = { status: "active" | "expired" };

/** Signal d'activité du navigateur (au plus 1/min). La base décide si la session vit encore. */
export async function keepSessionAliveAction(): Promise<KeepAliveState> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("touch_session");
  return { status: !error && data === "active" ? "active" : "expired" };
}

/** Fin du compte à rebours dans le navigateur : déconnexion de CET appareil, journalisée. */
export async function idleLogoutAction(formData: FormData): Promise<void> {
  const locale = formData.get("locale") === "fr" ? "fr" : "en";
  const admin = formData.get("area") === "admin";
  const supabase = await createSupabaseServerClient();
  const user = await getUser();
  await supabase.auth.signOut({ scope: "local" });
  if (user) {
    await recordAudit({
      action: "auth.session_timeout",
      resourceType: "session",
      actorId: user.id,
      metadata: { trigger: "client" },
    });
  }
  redirect(`/${locale}/${admin ? "staff/login" : "login"}?reason=${TIMEOUT_REASON}`);
}
