/**
 * Validation des chemins de redirection (« ?next=… ») — ADR 0010.
 * Code pur, sans dépendance : utilisable côté serveur comme dans proxy.ts.
 *
 * N'accepte QU'UN chemin interne du portail, sous /en/… ou /fr/…, après
 * décodage complet. Tout le reste (URL absolue, « // », « /\ », schémas,
 * caractères de contrôle, encodages imbriqués, traversée « .. ») renvoie le
 * chemin par défaut.
 */
const LOCALES = ["en", "fr"] as const;
const ALLOWED = /^\/(en|fr)(\/[A-Za-z0-9_\-/]*)?(\?[A-Za-z0-9=&%._\-]*)?$/;

function fullyDecode(value: string): string | null {
  let current = value;
  for (let i = 0; i < 3; i++) {
    let next: string;
    try {
      next = decodeURIComponent(current);
    } catch {
      return null;
    }
    if (next === current) return current;
    current = next;
  }
  return null; // encodage imbriqué suspect
}

export function defaultPortalPath(locale: string): string {
  return `/${(LOCALES as readonly string[]).includes(locale) ? locale : "en"}/portal`;
}

export function safeNextPath(value: string | null | undefined, locale: string, fallback?: string): string {
  const fb = fallback ?? defaultPortalPath(locale);
  if (!value || value.length > 512) return fb;

  const decoded = fullyDecode(value.trim());
  if (!decoded) return fb;
  // Caractères de contrôle, antislash, traversée de répertoire.
  if (/[\u0000-\u001f\u007f\\]/.test(decoded) || decoded.includes("..")) return fb;
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return fb;
  if (!ALLOWED.test(decoded)) return fb;
  // Le paramètre de requête ne doit pas lui-même contenir une URL.
  const query = decoded.split("?")[1] ?? "";
  if (/(^|[=&])(\/\/|[a-z][a-z0-9+.-]*:)/i.test(query)) return fb;

  return decoded;
}
