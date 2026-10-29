/**
 * Adresse d'autorisation OAuth (connexion Microsoft du personnel) telle que le navigateur doit la voir.
 * Code pur, sans dépendance.
 *
 * Sur le serveur de test (ADR 0016), l'application parle à Supabase Auth par une adresse INTERNE
 * (`http://gateway:8000`) que le navigateur ne peut pas joindre : on remplace l'origine par
 * l'adresse publique, qui n'expose que `/auth/v1/authorize` et `/auth/v1/callback`. En local et sur
 * Supabase hébergé, l'adresse est déjà publique (pas d'adresse publique distincte).
 *
 * Renvoie `null` si l'adresse reçue n'est pas l'autorisation de NOTRE Supabase Auth : jamais de
 * redirection vers une autre origine ni un autre chemin.
 */
const AUTHORIZE_PATH = "/auth/v1/authorize";

function parse(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function toBrowserAuthorizeUrl(
  url: string,
  supabaseUrl: string,
  publicSupabaseUrl?: string,
): string | null {
  const received = parse(url);
  const internal = parse(supabaseUrl);
  if (!received || !internal) return null;
  if (received.origin !== internal.origin || received.pathname !== AUTHORIZE_PATH) return null;
  if (!publicSupabaseUrl) return received.toString();
  const target = parse(publicSupabaseUrl);
  if (!target || target.protocol !== "https:") return null;
  return `${target.origin}${AUTHORIZE_PATH}${received.search}`;
}
