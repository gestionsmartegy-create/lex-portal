import { serviceClient } from "../integration/helpers";
import { expect, expectAccessible, signInWithMfa, test } from "./fixtures";

/** Recherche globale du client (docs/page-map.md `/portal/search`) : résultats limités par la RLS. */
const QUESTIONS_THREAD = "e0000000-0000-4000-8000-000000000001";

test.describe("recherche globale du portail", () => {
  test("trouve dossiers, documents et messages visibles ; jamais l'interne ni le dossier d'autrui", async ({
    page,
    client,
  }) => {
    test.setTimeout(120_000);
    // Le client du test lit le dossier LC-2026-0142 ; on l'ajoute au fil « Questions » du dossier.
    const admin = serviceClient();
    await admin
      .from("conversation_participants")
      .insert({ conversation_id: QUESTIONS_THREAD, user_id: client.id });
    try {
      await signInWithMfa(page, client.email, client.password);

      // Depuis l'en-tête : champ sur ordinateur, icône vers la page de recherche sur téléphone.
      await page.goto("/en/portal");
      if ((page.viewportSize()?.width ?? 1280) < 640) {
        await page.getByRole("link", { name: "Search" }).click();
        await expect(page).toHaveURL(/\/en\/portal\/search$/);
        await page.locator("#search-page").fill("Permanent");
        await page.locator("#search-page").press("Enter");
      } else {
        await page.locator("#header-search").fill("Permanent");
        await page.locator("#header-search").press("Enter");
      }
      await expect(page.getByRole("heading", { level: 2, name: "Matters" })).toBeVisible();
      await expect(page.getByRole("link", { name: /Permanent Residency Application/ })).toBeVisible();
      await expectAccessible(page);

      await page.goto("/en/portal/search?q=IRCC");
      await expect(page.getByText("IRCC Form IMM 5444.pdf")).toBeVisible();

      await page.goto("/fr/portal/search?q=declaration%20form");
      await expect(page.getByRole("link", { name: /LC-2026-0142 — Questions/ })).toBeVisible();
      await expectAccessible(page);

      // Jamais : document interne, dossier et document d'un autre client.
      for (const q of ["stratégie", "QVYON", "Certificate of Incorporation"]) {
        await page.goto(`/en/portal/search?q=${encodeURIComponent(q)}`);
        await expect(page.getByText("Nothing matches your search.")).toBeVisible();
      }

      // Saisies limites : trop court, jokers SQL et syntaxe de filtre traités comme du texte.
      for (const q of ["a", "**", "* *"]) {
        await page.goto(`/en/portal/search?q=${encodeURIComponent(q)}`);
        await expect(page.getByText("Type at least 2 characters.")).toBeVisible();
      }
      for (const q of ["%%", "a,b.or(id.eq.1)"]) {
        await page.goto(`/en/portal/search?q=${encodeURIComponent(q)}`);
        await expect(page.getByText("Nothing matches your search.")).toBeVisible();
      }
    } finally {
      await admin
        .from("conversation_participants")
        .delete()
        .eq("conversation_id", QUESTIONS_THREAD)
        .eq("user_id", client.id);
    }
  });
});
