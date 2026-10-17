import type { Page } from "@playwright/test";
import { serviceClient } from "../integration/helpers";
import { mockBusyBlocks } from "../../lib/outlook-simulator";
import { createStaffSession, expect, expectAccessible, test } from "./fixtures";

// Spec TEMPORAIRE de l'agent QA (lot 4, agendas Outlook) : supprimée à la fin de la QA.
const PAGES = [
  { name: "my-calendar", path: "/admin/my-calendar" },
  { name: "integrations", path: "/admin/integrations" },
  { name: "court-calendar-list", path: "/admin/court-calendar?view=list" },
  { name: "admin-home", path: "/admin" },
];

function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
  return errors;
}

for (const locale of ["en", "fr"] as const) {
  test(`QA parcours des pages touchées (${locale})`, async ({ page, context, baseURL }, testInfo) => {
    test.setTimeout(180_000);
    const staff = await createStaffSession(context, baseURL!, "firm_admin");
    const errors = watchConsole(page);
    try {
      for (const p of PAGES) {
        await page.goto(`/${locale}${p.path}`);
        await expect(page.locator("h1").first()).toBeVisible();
        await expect(page.getByText(/^(portal|admin|common|auth)\./)).toHaveCount(0);
        await expectAccessible(page);
        await page.screenshot({
          path: `.tmp/qa/${p.name}-${locale}-${testInfo.project.name}.png`,
          fullPage: true,
        });
      }
      expect(errors, "erreurs console").toEqual([]);
    } finally {
      await staff.cleanup();
    }
  });
}

test("QA scénario : connexion, rappels, conflit, retour Clio, coupure par firm_admin, entrée invalide", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.setTimeout(240_000);
  const admin = serviceClient();
  const staff = await createStaffSession(context, baseURL!, "firm_admin");
  const errors = watchConsole(page);
  const { data: matter } = await admin
    .from("matters")
    .insert({ display_number: `QA-AG-${Date.now()}`, title: "QA agenda", status: "open", is_mock: true })
    .select("id")
    .single();
  await admin.from("matter_team").insert({ matter_id: matter!.id, user_id: staff.id, role: "responsible" });
  const now = Date.now();
  const block = mockBusyBlocks(staff.id, new Date(now + 2 * 86_400_000), new Date(now + 10 * 86_400_000))[0]!;
  const start = new Date(Date.parse(block.start) + 15 * 60_000);
  const mk = async (startsAt: Date, entry: string | null) => {
    const { data } = await admin
      .from("court_dates")
      .insert({
        matter_id: matter!.id,
        kind: "hearing",
        starts_at: startsAt.toISOString(),
        timezone: "America/Halifax",
        status: "confirmed",
      })
      .select("id")
      .single();
    await admin.from("court_date_attendees").insert({ court_date_id: data!.id, user_id: staff.id });
    if (entry)
      await admin.from("court_dates").update({ clio_calendar_entry_id: entry, clio_sync_status: "synced" }).eq("id", data!.id);
    return data!.id as string;
  };
  try {
    await mk(start, null);
    const movedId = await mk(new Date(now + 3 * 86_400_000), `qa-moved-${now}`);
    const deletedId = await mk(new Date(now + 4 * 86_400_000), `qa-deleted-${now}`);

    // 1. Connexion (FR), badge démo, rappels.
    await page.goto("/fr/admin/my-calendar");
    await expect(page.getByText("Non connecté")).toBeVisible();
    await page.getByRole("button", { name: "Connecter mon agenda Outlook" }).click();
    await expect(page.getByText(/Votre agenda est connecté/)).toBeVisible();
    await expect(page.getByText("Connecté", { exact: true })).toBeVisible();
    await expect(page.getByText("Données de démonstration")).toBeVisible();
    await page.getByRole("button", { name: "Activer les rappels" }).click();
    await expect(page.getByText(/Rappels activés : ils apparaissent/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Retirer les rappels" })).toBeVisible();
    await page.screenshot({ path: `.tmp/qa/scenario-connected-fr-${testInfo.project.name}.png`, fullPage: true });

    // Paramètre de notice inconnu : ignoré, aucune notice.
    await page.goto("/fr/admin/my-calendar?notice=bogus");
    await expect(page.getByText(/Votre agenda est connecté\./)).toHaveCount(0);

    // 2. Calendrier de cour (FR) : conflit « Occupé dans Outlook ».
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Halifax" }).format(start);
    await page.goto(`/fr/admin/court-calendar?view=list&date=${day}`);
    await expect(page.getByText("Occupé dans Outlook").first()).toBeVisible();
    await page.screenshot({ path: `.tmp/qa/scenario-busy-fr-${testInfo.project.name}.png`, fullPage: true });

    // 3. Retour depuis Clio : déplacée → à confirmer, supprimée → annulée ; signalé dans « À surveiller ».
    const r1 = await admin.rpc("court_date_apply_clio_change", {
      p_id: movedId,
      p_change: "moved",
      p_starts: new Date(now + 5 * 86_400_000).toISOString(),
      p_ends: null as unknown as string,
    });
    const r2 = await admin.rpc("court_date_apply_clio_change", {
      p_id: deletedId,
      p_change: "deleted",
      p_starts: null as unknown as string,
      p_ends: null as unknown as string,
    });
    expect([r1.data, r2.data, r1.error, r2.error]).toEqual([true, true, null, null]);
    const { data: rows } = await admin.from("court_dates").select("id, status").in("id", [movedId, deletedId]);
    const st = Object.fromEntries((rows ?? []).map((r) => [r.id, r.status]));
    expect([st[movedId], st[deletedId]]).toEqual(["scheduled", "cancelled"]);
    await page.goto("/en/admin");
    await expect(page.getByText(/dates? changed in Clio/)).toBeVisible();
    await expect(page.getByText(/Changed in Clio/).first()).toBeVisible();
    await expect(page.getByText(/Deleted in Clio/).first()).toBeVisible();
    await expectAccessible(page);
    await page.screenshot({ path: `.tmp/qa/scenario-watch-en-${testInfo.project.name}.png`, fullPage: true });

    // 4. Entrée invalide : identifiant falsifié dans le formulaire de coupure → notice d'échec.
    await page.goto("/en/admin/integrations");
    const section = page.locator("section", {
      has: page.getByRole("heading", { name: "Connected Outlook calendars" }),
    });
    const myRow = section.locator("li", { hasText: "Morgan Test" }).first();
    await expect(myRow).toBeVisible();
    await expect(myRow.getByText(/simulator/)).toBeVisible();
    await myRow.locator('input[name="userId"]').evaluate((el) => ((el as HTMLInputElement).value = "not-a-uuid"));
    await myRow.getByRole("button", { name: "Cut connection" }).click();
    await expect(page.getByText("The operation failed. Try again or reconnect Clio.")).toBeVisible();

    // 5. Coupure par le firm_admin, puis la personne voit « Not connected ».
    const row2 = page
      .locator("section", { has: page.getByRole("heading", { name: "Connected Outlook calendars" }) })
      .locator("li", { hasText: "Morgan Test" })
      .first();
    await row2.getByRole("button", { name: "Cut connection" }).click();
    await expect(page.getByText("The calendar connection was cut.")).toBeVisible();
    await page.goto("/en/admin/my-calendar");
    await expect(page.getByText("Not connected")).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect my Outlook calendar" })).toBeVisible();
    expect(errors, "erreurs console").toEqual([]);
  } finally {
    await admin.from("court_dates").delete().eq("matter_id", matter!.id);
    await admin.from("matter_team").delete().eq("matter_id", matter!.id);
    await admin.from("matters").delete().eq("id", matter!.id);
    await staff.cleanup();
  }
});
