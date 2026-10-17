import { afterAll, describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { DEMO_ADMIN, serviceClient, testPassword, uniqueEmail, waitForEmail } from "./helpers";

// Hors requête Next.js : en-têtes vides et traductions lues dans messages/*.json.
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: "en" | "fr"; namespace: string }) =>
    createTranslator({ locale, messages: locale === "fr" ? fr : en, namespace: namespace as never }),
}));

const { pushCourtDateReminders } = await import("@/server/services/client-court-dates");

/** Lot 5 (ADR 0028) : rappels J-7 et J-1 aux clients, une seule fois, e-mail sans détail. */
const admin = serviceClient();
const users: string[] = [];
const matters: string[] = [];
const COURT_ROOM = "Salle secrète 42";

async function makeClient(prefix: string) {
  const email = uniqueEmail(prefix);
  const { data } = await admin.auth.admin.createUser({
    email,
    password: testPassword(),
    email_confirm: true,
  });
  const id = data.user!.id;
  users.push(id);
  await admin.from("profiles").update({ status: "active", first_name: "Alex" }).eq("id", id);
  return { id, email };
}

async function makeMatter() {
  const { data } = await admin
    .from("matters")
    .insert({
      display_number: `IT-CRT-${Date.now()}`,
      title: "Dossier rappel",
      status: "open",
      is_mock: true,
    })
    .select("id")
    .single();
  matters.push(data!.id);
  return data!.id;
}

afterAll(async () => {
  for (const id of matters) {
    await admin.from("notifications").delete().eq("matter_id", id);
    await admin.from("court_dates").delete().eq("matter_id", id);
    await admin.from("matter_access").delete().eq("matter_id", id);
    await admin.from("matters").delete().eq("id", id);
  }
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

describe("rappels de dates de cour (lot 5)", () => {
  it("J-7 puis J-1 : notification dans le portail, e-mail sans détail, jamais en double", async () => {
    const client = await makeClient("crtclient");
    const revoked = await makeClient("crtrevoked");
    const matterId = await makeMatter();
    await admin.from("matter_access").insert([
      { matter_id: matterId, user_id: client.id, access_level: "read", granted_by: DEMO_ADMIN },
      { matter_id: matterId, user_id: revoked.id, access_level: "read", granted_by: DEMO_ADMIN },
    ]);
    // Accès retiré après coup, comme le fait le cabinet.
    await admin
      .from("matter_access")
      .update({ revoked_at: new Date().toISOString(), revoked_by: DEMO_ADMIN, revoke_reason: "Test" })
      .eq("matter_id", matterId)
      .eq("user_id", revoked.id);
    const now = new Date();
    const { data: soon } = await admin
      .from("court_dates")
      .insert({
        matter_id: matterId,
        kind: "hearing",
        starts_at: new Date(now.getTime() + 3 * 86_400_000).toISOString(),
        timezone: "America/Halifax",
        room: COURT_ROOM,
        visible_to_client: true,
        status: "scheduled",
      })
      .select("id")
      .single();
    // Une date non visible ne déclenche rien.
    await admin.from("court_dates").insert({
      matter_id: matterId,
      kind: "trial",
      starts_at: new Date(now.getTime() + 2 * 86_400_000).toISOString(),
      timezone: "America/Halifax",
      visible_to_client: false,
      status: "scheduled",
    });

    await pushCourtDateReminders(now);
    const { data: notes } = await admin
      .from("notifications")
      .select("type, title, body, user_id")
      .eq("matter_id", matterId);
    expect(notes).toHaveLength(1);
    expect(notes![0]).toMatchObject({ type: "court_date_reminder", user_id: client.id });
    expect(notes![0]!.body).not.toContain(COURT_ROOM);

    const mail = await waitForEmail(client.email, "upcoming date");
    expect(mail.text + mail.html).not.toContain(COURT_ROOM);
    expect(mail.text + mail.html).not.toContain("IT-CRT-");
    expect(mail.html).toContain("/en/portal/appointments");

    // Deuxième passage : aucun doublon.
    await pushCourtDateReminders(now);
    const { count: again } = await admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("matter_id", matterId);
    expect(again).toBe(1);

    // La veille : un rappel « demain », une seule fois.
    const dayBefore = new Date(now.getTime() + 2.5 * 86_400_000);
    await pushCourtDateReminders(dayBefore);
    await pushCourtDateReminders(dayBefore);
    const { data: all } = await admin
      .from("notifications")
      .select("title, priority")
      .eq("matter_id", matterId)
      .order("created_at");
    expect(all).toHaveLength(2);
    expect(all![1]).toMatchObject({ title: "Court date within 24 hours", priority: "urgent" });
    // Le client dont l'accès a été retiré ne reçoit jamais rien.
    const { count: revokedNotes } = await admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", revoked.id);
    expect(revokedNotes).toBe(0);
    expect(soon).toBeTruthy();
  });
});
