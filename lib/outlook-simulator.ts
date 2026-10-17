import { zonedToUtc } from "@/lib/zoned-time";

/**
 * Agenda FICTIF du simulateur Outlook (ADR 0031), sans dépendance serveur : plages occupées en semaine
 * selon un modèle fixe, décalé selon la personne, à l'heure de Halifax. Aucune donnée réelle.
 */
export type SimulatedBusyBlock = { start: string; end: string };

const TZ = "America/Halifax";
/** [jour de la semaine (0 = dimanche), début, fin] à l'heure locale. */
const PATTERN: [number, string, string][] = [
  [1, "09:00", "10:30"],
  [2, "13:00", "14:00"],
  [3, "10:00", "11:30"],
  [4, "15:00", "16:00"],
  [5, "09:00", "10:00"],
];

export function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function shift(time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number) as [number, number];
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Plages occupées fictives sur [from, to[ ; décalage de 0, 30 ou 60 minutes selon la personne. */
export function mockBusyBlocks(userId: string, from: Date, to: Date): SimulatedBusyBlock[] {
  const offset = (hash(userId) % 3) * 30;
  const out: SimulatedBusyBlock[] = [];
  const day = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  for (; day < to && out.length < 200; day.setUTCDate(day.getUTCDate() + 1)) {
    const iso = day.toISOString().slice(0, 10);
    for (const [weekday, start, end] of PATTERN) {
      if (day.getUTCDay() !== weekday) continue;
      const s = zonedToUtc(`${iso}T${shift(start, offset)}`, TZ);
      const e = zonedToUtc(`${iso}T${shift(end, offset)}`, TZ);
      if (s && e && new Date(e) > from && new Date(s) < to) out.push({ start: s, end: e });
    }
  }
  return out;
}
