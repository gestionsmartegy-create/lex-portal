/**
 * Heures « murales » dans un fuseau donné (ADR 0025) : une audience à 9 h 30 à Toronto est saisie et
 * affichée à 9 h 30 heure de l'Est, quel que soit le fuseau de la personne qui la saisit.
 * Conversion par Intl uniquement (aucune table de fuseaux embarquée) ; changements d'heure gérés.
 */

/** Décalage du fuseau à un instant donné, en minutes (ex. -240 pour l'Atlantique en été). */
export function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * « 2026-11-20T09:30 » (heure locale du fuseau) → instant UTC (ISO).
 * Heure inexistante (saut du printemps) : décalée vers l'avant comme le ferait une horloge.
 * Heure ambiguë (retour de l'automne) : première occurrence.
 */
export function zonedToUtc(local: string, timeZone: string): string | null {
  const m = LOCAL.exec(local);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(wall);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  // Deux candidats : le décalage dépend de l'instant recherché.
  const first = wall - offsetMinutes(new Date(wall), timeZone) * 60_000;
  const second = wall - offsetMinutes(new Date(first), timeZone) * 60_000;
  const exact = [first, second].filter((c) => utcToZonedInput(new Date(c).toISOString(), timeZone) === local);
  // Heure ambiguë : la première occurrence ; heure inexistante : l'horloge avance (candidat le plus tardif).
  const guess = exact.length ? Math.min(...exact) : Math.max(first, second);
  return new Date(guess).toISOString();
}

/** Instant (ISO) → « AAAA-MM-JJTHH:MM » dans le fuseau (valeur d'un champ datetime-local). */
export function utcToZonedInput(iso: string, timeZone: string): string {
  const instant = new Date(iso);
  const shifted = new Date(instant.getTime() + offsetMinutes(instant, timeZone) * 60_000);
  return shifted.toISOString().slice(0, 16);
}

const intlLocale = (locale: string) => (locale === "fr" ? "fr-CA" : "en-CA");

/** « 20 nov. 2026, 09 h 30 HNA » : date et heure dans le fuseau du tribunal, avec son abréviation. */
export function formatZoned(iso: string, timeZone: string, locale: string, allDay = false): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(allDay ? {} : { hour: "numeric", minute: "2-digit", timeZoneName: "short" }),
  }).format(new Date(iso));
}

/** Heure seule dans un fuseau (« 11 h 00 »), pour l'heure de fin. */
export function formatZonedTime(iso: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone, hour: "numeric", minute: "2-digit" }).format(
    new Date(iso),
  );
}
