import { afterAll, describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import {
  DEMO_ADMIN,
  JOHN_MATTER,
  enrollAndVerifyTotp,
  serviceClient,
  signIn,
  testPassword,
  uniqueEmail,
  waitForEmail,
} from "./helpers";

// Hors requête Next.js : en-têtes vides et traductions lues dans messages/*.json.
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: "en" | "fr"; namespace: string }) =>
    createTranslator({ locale, messages: locale === "fr" ? fr : en, namespace: namespace as never }),
}));

const { notifyNewMessage } = await import("@/server/services/message-notifier");

/** J7 (ADR 0017) : messagerie du cabinet et avis de nouveau message, avec de vraies sessions. */
const admin = serviceClient();
const created: string[] = [];
const SECRET_TEXT = "Contenu confidentiel 4471";

async function makeClient() {
  const email = uniqueEmail("j7client");
  const password = testPassword();
  const { data } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: "Sam" },
  });
  const id = data.user!.id;
  created.push(id);
  await admin.from("profiles").update({ status: "active", first_name: "Sam" }).eq("id", id);
  await admin
    .from("matter_access")
    .insert({ matter_id: JOHN_MATTER, user_id: id, access_level: "read_write", granted_by: DEMO_ADMIN });
  const client = await signIn(email, password);
  await enrollAndVerifyTotp(client);
  return { id, email, client };
}

async function makeStaff(onTeam: boolean) {
  const email = uniqueEmail("j7staff", "lexcanadalaw.test");
  const password = testPassword();
  await admin.rpc("authorize_staff_provisioning", { p_email: email, p_role: "staff", p_actor: DEMO_ADMIN });
  const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const id = data.user!.id;
  created.push(id);
  if (onTeam)
    await admin.from("matter_team").insert({ matter_id: JOHN_MATTER, user_id: id, role: "collaborator" });
  return { id, email, client: await signIn(email, password) };
}

afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

describe("messagerie du cabinet (J7)", () => {
  it("client → équipe → client : lecture, réponse, notification et e-mail sans contenu", async () => {
    const sam = await makeClient();
    const staff = await makeStaff(true);

    // 1. Le client ouvre un fil et écrit.
    // Identifiant généré par l'application, insertion sans retour (correctif B6/C7).
    const conv = { id: crypto.randomUUID() };
    const { error: convError } = await sam.client.from("conversations").insert({
      id: conv.id,
      matter_id: JOHN_MATTER,
      scope: "matter",
      subject: "Question J7",
      created_by: sam.id,
    });
    expect(convError).toBeNull();
    const { error: msgError } = await sam.client
      .from("messages")
      .insert({ conversation_id: conv.id, sender_id: sam.id, body: "Bonjour" });
    expect(msgError).toBeNull();

    // 2. Le membre de l'équipe ne lit rien avant de rejoindre, puis rejoint, lit et répond.
    expect((await staff.client.from("messages").select("id").eq("conversation_id", conv!.id)).data).toEqual(
      [],
    );
    expect((await staff.client.rpc("join_conversation", { p_conversation: conv!.id })).data).toBe(true);
    expect(
      (await staff.client.from("messages").select("id").eq("conversation_id", conv!.id)).data?.length,
    ).toBe(1);
    const { error: replyError } = await staff.client
      .from("messages")
      .insert({ conversation_id: conv!.id, sender_id: staff.id, body: SECRET_TEXT });
    expect(replyError).toBeNull();

    // 3. Avis : notification dans le portail et e-mail SANS le contenu.
    await notifyNewMessage({
      conversationId: conv!.id,
      matterId: JOHN_MATTER,
      senderId: staff.id,
      senderIsClient: false,
    });
    const { data: notes } = await admin
      .from("notifications")
      .select("type, title, body, action_url")
      .eq("user_id", sam.id);
    expect(notes).toEqual([
      expect.objectContaining({ type: "new_message", action_url: `/portal/messages/${conv!.id}` }),
    ]);
    expect(JSON.stringify(notes)).not.toContain(SECRET_TEXT);
    const mail = await waitForEmail(sam.email, "new message");
    expect(mail.text + mail.html).not.toContain(SECRET_TEXT);
    expect(mail.html).toContain(`/en/portal/messages/${conv!.id}`);

    // 4. Un deuxième message dans les 15 min : notification, mais pas de deuxième e-mail.
    await notifyNewMessage({
      conversationId: conv!.id,
      matterId: JOHN_MATTER,
      senderId: staff.id,
      senderIsClient: false,
    });
    const res = await fetch(
      `http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(`to:"${sam.email}"`)}`,
    );
    const found = (await res.json()) as { messages: { Subject: string }[] };
    // La boîte contient aussi l'alerte « méthode de vérification ajoutée » : on ne compte que les avis.
    expect(found.messages.filter((m) => m.Subject.includes("new message")).length).toBe(1);
  });

  it("accès retiré : un client révoqué et un membre sorti de l'équipe ne reçoivent plus aucun avis", async () => {
    const writer = await makeClient();
    const removedClient = await makeClient();
    const keptStaff = await makeStaff(true);
    const removedStaff = await makeStaff(true);

    // Fil où tous sont participants.
    const conv = { id: crypto.randomUUID() };
    await admin.from("conversations").insert({
      id: conv.id,
      matter_id: JOHN_MATTER,
      scope: "matter",
      subject: "Révocation J7",
      created_by: writer.id,
    });
    await admin.from("conversation_participants").upsert(
      [writer, removedClient, keptStaff, removedStaff].map((p) => ({
        conversation_id: conv.id,
        user_id: p.id,
      })),
      { onConflict: "conversation_id,user_id", ignoreDuplicates: true },
    );

    // Le cabinet retire l'accès du client et sort un membre de l'équipe ; ils restent participants.
    await admin
      .from("matter_access")
      .update({ revoked_at: new Date().toISOString(), revoked_by: DEMO_ADMIN })
      .eq("matter_id", JOHN_MATTER)
      .eq("user_id", removedClient.id);
    await admin.from("matter_team").delete().eq("matter_id", JOHN_MATTER).eq("user_id", removedStaff.id);

    await notifyNewMessage({
      conversationId: conv.id,
      matterId: JOHN_MATTER,
      senderId: writer.id,
      senderIsClient: true,
    });

    // Témoin : le membre resté dans l'équipe est bien averti (les envois ont donc eu lieu).
    await waitForEmail(keptStaff.email, "new message");
    const { data: notes } = await admin.from("notifications").select("id").eq("user_id", removedClient.id);
    expect(notes).toEqual([]);
    for (const email of [removedClient.email, removedStaff.email]) {
      const res = await fetch(
        `http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
      );
      const found = (await res.json()) as { messages: { Subject: string }[] };
      expect(found.messages.filter((m) => m.Subject.includes("new message"))).toEqual([]);
    }
  });

  it("personnel hors équipe : ne peut ni rejoindre ni lire", async () => {
    const outsider = await makeStaff(false);
    const { data: conv } = await admin
      .from("conversations")
      .select("id")
      .eq("matter_id", JOHN_MATTER)
      .limit(1)
      .single();
    expect((await outsider.client.rpc("join_conversation", { p_conversation: conv!.id })).data).toBe(false);
    expect(
      (await outsider.client.from("messages").select("id").eq("conversation_id", conv!.id)).data,
    ).toEqual([]);
  });

  it("client en lecture seule : ne peut pas répondre", async () => {
    const email = uniqueEmail("j7read");
    const password = testPassword();
    const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    const id = data.user!.id;
    created.push(id);
    await admin.from("profiles").update({ status: "active" }).eq("id", id);
    await admin
      .from("matter_access")
      .insert({ matter_id: JOHN_MATTER, user_id: id, access_level: "read", granted_by: DEMO_ADMIN });
    const reader = await signIn(email, password);
    await enrollAndVerifyTotp(reader);
    const { data: conv } = await admin
      .from("conversations")
      .select("id")
      .eq("matter_id", JOHN_MATTER)
      .limit(1)
      .single();
    await admin.from("conversation_participants").insert({ conversation_id: conv!.id, user_id: id });
    const { error } = await reader
      .from("messages")
      .insert({ conversation_id: conv!.id, sender_id: id, body: "essai" });
    expect(error).not.toBeNull();
  });
});
