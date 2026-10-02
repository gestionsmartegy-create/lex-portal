/**
 * Domaines du personnel du cabinet (miroir de private.staff_email_domains,
 * ADR 0009). Les comptes de ces domaines ne se connectent JAMAIS par la page
 * client : connexion Microsoft uniquement (ou formulaire de démonstration
 * local pour *.test).
 */
export const STAFF_DOMAINS = ["lexcanadalaw.com"] as const;
export const DEMO_STAFF_DOMAIN_SUFFIX = ".test";

export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

export function isStaffEmail(email: string): boolean {
  const domain = emailDomain(email);
  return (STAFF_DOMAINS as readonly string[]).includes(domain) || domain.endsWith(DEMO_STAFF_DOMAIN_SUFFIX);
}

export function isDemoStaffEmail(email: string): boolean {
  return emailDomain(email).endsWith(DEMO_STAFF_DOMAIN_SUFFIX);
}

/** Durée de validité d'une invitation (aligné sur la valeur par défaut en base). */
export const INVITATION_TTL_HOURS = 72;
