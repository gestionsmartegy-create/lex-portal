import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

// AGENTS.md §5 : toute clé ajoutée l'est dans les deux langues.
function flattenKeys(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

function placeholders(messages: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const walk = (value: unknown, path: string) => {
    if (typeof value === "string") {
      // Variable ICU = « {nom} » ou « {nom, … » ; le texte des branches plurielles n'en est pas.
      out[path] = [...value.matchAll(/\{(\w+)(?=[},])/g)].map((m) => m[1] ?? "").sort();
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k);
    }
  };
  walk(messages, "");
  return out;
}

describe("traductions", () => {
  it("en.json et fr.json ont exactement les mêmes clés", () => {
    expect(flattenKeys(fr).sort()).toEqual(flattenKeys(en).sort());
  });

  it("les variables {…} sont identiques dans les deux langues", () => {
    expect(placeholders(fr)).toEqual(placeholders(en));
  });

  it("aucune traduction n'est vide", () => {
    const empty = Object.entries(placeholders(en))
      .concat(Object.entries(placeholders(fr)))
      .filter(([path]) => {
        const get = (obj: unknown) =>
          path.split(".").reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], obj);
        return get(en) === "" || get(fr) === "";
      });
    expect(empty).toEqual([]);
  });
});
