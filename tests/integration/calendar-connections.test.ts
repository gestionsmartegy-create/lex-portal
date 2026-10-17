import { afterAll, describe, expect, it, vi } from "vitest";
import { DEMO_ADMIN, serviceClient, signIn, testPassword, uniqueEmail } from "./helpers";

// Hors requête Next.js : en-têtes vides.
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { syncOutlookCalendars } = await import("@/server/services/calendar-connections");
const { pullClioCourtDateChanges } = await import("@/server/services/court-dates");
const { mockBusyBlocks } = await import("@/server/providers/outlook/mock");
const { getClioGateway } = await import("@/server/providers");

/** Lot 4 (ADR 0031) : agenda Outlook (simulateur) et retour depuis Clio, avec de vraies sessions. */
const admin = serviceClient();
const users: string[] = [];
const matters: string[] = [];

afterAll(async () => {
  for (const id of matters) {
    await admin.from("court_dates").delete().eq("matter_id", id);
    await admin.from("matter_team").delete().eq("matter_id", id);
    await admin.from("matters").delete().eq("id", id);
  }
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

async function makeStaff() {
  const email = uniqueEmail("agenda", "lexcanadalaw.test");
  const password = testPassword();
  await admin.rpc("authorize_staff_provisioning", { p_email: email, p_role: "staff", p_actor: DEMO_ADMIN });
  const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const id = data.user!.id;
  users.push(id);
  return { id, client: await signIn(email, password) };
}

async function makeMatter(staffId: string) {
  const { data } = await admin
    .from("matters")
    .insert({
      display_number: `IT-CAL-${Date.now()}`,
      title: "Dossier agenda",
      status: "open",
      is_mock: true,
    })
    .select("id")
    .single();
  matters.push(data!.id);
  await admin.from("matter_team").insert({ matter_id: data!.id, user_id: staffId, role: "responsible" });
  return data!.id;
}

async function makeCourtDate(matterId: string, staffId: string, start: Date, minutes = 60) {
  const { data } = await admin
    .from("court_dates")
    .insert({
      matter_id: matterId,
      kind: "hearing",
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + minutes * 60_000).toISOString(),
      timezone: "America/Halifax",
      status: "confirmed",
    })
    .select("id")
    .single();
  await admin.from("court_date_attendees").insert({ court_date_id: data!.id, user_id: staffId });
  return data!.id;
}

describe("agendas Outlook (simulateur) et retour Clio (lot 4)", () => {
  it("connexion, conflit avec une plage occupée, rappels, déconnexion", async () => {
    const staff = await makeStaff();
    const matterId = await makeMatter(staff.id);
    // Une plage occupée fictive dans 2 à 20 jours : l'audience commence 15 minutes après son début.
    const now = Date.now();
    const block = mockBusyBlocks(
      staff.id,
      new Date(now + 2 * 86_400_000),
      new Date(now + 20 * 86_400_000),
    )[0]!;
    const courtDate = await makeCourtDate(
      matterId,
      staff.id,
      new Date(Date.parse(block.start) + 15 * 60_000),
    );

    // Connexion (le serveur l'enregistre après le contrôle du rôle), puis synchronisation.
    const { error } = await admin.rpc("calendar_save_connection", {
      p_user: staff.id,
      p_is_mock: true,
      p_payload: null as unknown as string,
      p_scopes: ["Calendars.ReadBasic"],
    });
    expect(error).toBeNull();
    expect((await syncOutlookCalendars()).synced).toBeGreaterThanOrEqual(1);

    const range = {
      p_from: new Date(now).toISOString(),
      p_to: new Date(now + 30 * 86_400_000).toISOString(),
    };
    const { data: conflicts } = await staff.client.rpc("court_date_busy_conflicts", range);
    expect((conflicts ?? []).map((c) => c.court_date_id)).toContain(courtDate);
    const { data: mine } = await staff.client.rpc("my_calendar_connection");
    expect(mine?.[0]).toMatchObject({ status: "connected", is_mock: true });

    // Rappels : la personne les active ; le planificateur écrit le rappel J-1.
    expect((await staff.client.rpc("calendar_set_reminders", { p_enabled: true })).data).toBe(true);
    await syncOutlookCalendars();
    const { data: events } = await admin.rpc("calendar_reminder_events_of", { p_user: staff.id });
    expect((events ?? []).filter((e) => e.court_date_id === courtDate).length).toBeGreaterThanOrEqual(1);

    // Déconnexion par la personne : connexion, plages et rappels supprimés (audit : test pgTAP 24).
    expect((await staff.client.rpc("calendar_disconnect", { p_user: staff.id })).data).toBe(true);
    expect((await staff.client.rpc("my_calendar_connection")).data).toHaveLength(0);
    expect((await staff.client.rpc("court_date_busy_conflicts", range)).data ?? []).toHaveLength(0);
    expect((await admin.rpc("calendar_reminder_events_of", { p_user: staff.id })).data).toHaveLength(0);
  });

  it("retour Clio : une entrée déplacée redevient « à confirmer », une entrée supprimée est annulée", async () => {
    const staff = await makeStaff();
    const matterId = await makeMatter(staff.id);
    const start = new Date(Date.now() + 10 * 86_400_000);
    const moved = await makeCourtDate(matterId, staff.id, start);
    const removed = await makeCourtDate(matterId, staff.id, new Date(start.getTime() + 86_400_000));
    const clio = getClioGateway();
    const base = {
      calendarId: 1,
      matterId: null,
      summary: "x",
      description: "",
      location: "",
      allDay: false,
    };
    // Entrée déplacée d'un jour dans Clio.
    const movedEntry = await clio.createCalendarEntry({
      ...base,
      startAt: new Date(start.getTime() + 86_400_000).toISOString(),
      endAt: new Date(start.getTime() + 86_400_000 + 3_600_000).toISOString(),
    });
    // Entrée supprimée dans Clio.
    const removedEntry = await clio.createCalendarEntry({
      ...base,
      startAt: start.toISOString(),
      endAt: start.toISOString(),
    });
    await clio.deleteCalendarEntry(removedEntry);
    await admin
      .from("court_dates")
      .update({ clio_calendar_entry_id: movedEntry, clio_sync_status: "synced" })
      .eq("id", moved);
    await admin
      .from("court_dates")
      .update({ clio_calendar_entry_id: removedEntry, clio_sync_status: "synced" })
      .eq("id", removed);

    const result = await pullClioCourtDateChanges(500);
    expect(result.moved).toBeGreaterThanOrEqual(1);
    expect(result.missing).toBeGreaterThanOrEqual(1);
    const { data } = await admin
      .from("court_dates")
      .select("id, status, clio_change, starts_at")
      .in("id", [moved, removed]);
    const byId = new Map((data ?? []).map((r) => [r.id, r]));
    expect(byId.get(moved)).toMatchObject({ status: "scheduled", clio_change: "moved" });
    expect(Date.parse(byId.get(moved)!.starts_at)).toBe(start.getTime() + 86_400_000);
    // Introuvable dans Clio : signalée et « à confirmer », jamais annulée automatiquement.
    expect(byId.get(removed)).toMatchObject({ status: "scheduled", clio_change: "deleted" });
  });
});
