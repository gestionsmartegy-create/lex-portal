/**
 * Formatage partagé (AGENTS.md §5) : montants en CAD à partir d'une CHAÎNE décimale
 * (jamais de calcul flottant), dates dans le fuseau America/Halifax par défaut.
 */
export const DEFAULT_TIMEZONE = "America/Halifax";

const intlLocale = (locale: string) => (locale === "fr" ? "fr-CA" : "en-CA");

/** « 1250.00 » → « 1 250,00 $ » (fr) / « $1,250.00 » (en). Intl accepte une chaîne décimale exacte. */
/**
 * Nombre décimal exact (chaîne venue de la base, jamais un flottant) : zéros inutiles retirés,
 * virgule en français. « 9.975 » → « 9,975 » ; « 1.00 » → « 1 » ; « 2.50 » → « 2,5 ».
 */
export function formatDecimal(value: string, locale: string): string {
  const trimmed = value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
  return locale === "fr" ? trimmed.replace(".", ",") : trimmed;
}

export function formatMoney(amount: string, locale: string, currency = "CAD"): string {
  const nf = new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency });
  return nf.format(amount as unknown as number);
}

export function formatDate(value: string | Date, locale: string, timeZone = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeZone }).format(
    new Date(value),
  );
}

/** Date « AAAA-MM-JJ » (colonne `date`) : affichée telle quelle, sans décalage de fuseau. */
export function formatCalendarDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

export function formatDateTime(value: string | Date, locale: string, timeZone = DEFAULT_TIMEZONE): string {
  // dateStyle/timeStyle ne se combinent pas avec timeZoneName : champs explicites.
  return new Intl.DateTimeFormat(intlLocale(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(new Date(value));
}

/** « il y a 5 min » / « 5 min ago ». `now` injectable pour les tests. */
export function formatRelative(value: string | Date, locale: string, now: Date = new Date()): string {
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto", style: "short" });
  const seconds = Math.round((new Date(value).getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(Math.round(seconds), "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 30 * 86_400) return rtf.format(Math.round(seconds / 86_400), "day");
  if (abs < 365 * 86_400) return rtf.format(Math.round(seconds / (30 * 86_400)), "month");
  return rtf.format(Math.round(seconds / (365 * 86_400)), "year");
}

/** 1258291 → « 1,2 Mo » / « 1.2 MB ». */
export function formatBytes(bytes: number | null | undefined, locale: string): string {
  if (!bytes || bytes < 0) return "—";
  const units = locale === "fr" ? ["o", "Ko", "Mo", "Go"] : ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const nf = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: unit === 0 ? 0 : 1 });
  return `${nf.format(value)} ${units[unit]}`;
}

/** Initiales pour l'avatar : « John Doe » → « JD ». */
export function initials(first?: string | null, last?: string | null, fallback = "?"): string {
  const value = `${first?.trim()[0] ?? ""}${last?.trim()[0] ?? ""}`.toUpperCase();
  return value || fallback;
}
