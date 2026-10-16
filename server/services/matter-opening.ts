import "server-only";
import { z } from "zod";
import type { AccessLevel } from "@/types/domain";
import { getSessionRole, getUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { grantMatterAccess } from "@/server/services/admin";
import { recordAudit } from "@/server/services/audit";
import { getMatterTypeTemplate, listMatterTypes } from "@/server/services/matter-templates";
import {
  addTeamMember,
  applyTemplateSteps,
  createDocumentRequest,
  setMatterType,
  type TeamRole,
} from "@/server/services/matter-tracking";
import { addDeliverable } from "@/server/services/matter-workspace";
import { listOffices, setMatterOffice } from "@/server/services/offices";

/**
 * Assistant d'ouverture d'un dossier (ADR 0020, plan phase 1) : firm_admin seulement.
 * Le dossier existe déjà (importé de Clio, registre officiel). L'assistant enchaîne les services
 * existants, chacun revérifiant l'accès et passant par la RLS : type et étapes du modèle, équipe,
 * accès du client, documents demandés, premiers livrables. Rien n'est contourné.
 */
const uuid = z.uuid();
type Person = { id: string; first_name: string | null; last_name: string | null; email: string };

export async function getOpeningContext(matterId: string | null, typeId: string | null) {
  if ((await getSessionRole()) !== "firm_admin") return null;
  const supabase = await createSupabaseServerClient();
  const [{ data: matters }, types, { data: staff }, { data: clients }, offices] = await Promise.all([
    supabase
      .from("matters")
      .select("id, display_number, title, responsible_name, matter_type_id, is_mock")
      .neq("status", "closed")
      .order("updated_at", { ascending: false })
      .limit(200),
    listMatterTypes({ activeOnly: true }),
    supabase
      .from("profiles")
      .select("id, first_name, last_name, email")
      .in("role", ["staff", "firm_admin"])
      .eq("status", "active")
      .order("last_name"),
    supabase
      .from("profiles")
      .select("id, first_name, last_name, email")
      .eq("role", "client")
      .eq("status", "active")
      .order("last_name")
      .limit(500),
    listOffices({ activeOnly: true }),
  ]);
  const matter =
    matterId && uuid.safeParse(matterId).success ? (matters ?? []).find((m) => m.id === matterId) : null;
  const template = typeId && uuid.safeParse(typeId).success ? await getMatterTypeTemplate(typeId) : null;
  return {
    matters: matters ?? [],
    types,
    staff: (staff ?? []) as Person[],
    clients: (clients ?? []) as Person[],
    matter: matter ?? null,
    template,
    offices,
  };
}

export type OpeningInput = {
  matterId: string;
  typeId: string;
  officeId: string | null;
  applySteps: boolean;
  responsibleId: string | null;
  collaboratorIds: string[];
  clientId: string | null;
  accessLevel: AccessLevel;
  documentIds: string[];
  documentsDue: string | null;
  deliverables: { title: string; dueDate: string | null }[];
};

/** Résultat détaillé : chaque étape réussie ou non, pour un message honnête à l'écran. */
export type OpeningReport = { ok: boolean; failed: string[] };

export async function openMatter(input: OpeningInput): Promise<OpeningReport> {
  if ((await getSessionRole()) !== "firm_admin") return { ok: false, failed: ["role"] };
  const user = await getUser();
  const failed: string[] = [];

  // Dossier ouvert seulement (un dossier fermé ne se met pas en place) ; documents du type choisi seulement.
  const supabase = await createSupabaseServerClient();
  const { data: matter } = await supabase
    .from("matters")
    .select("status")
    .eq("id", input.matterId)
    .maybeSingle();
  if (!matter || matter.status === "closed") return { ok: false, failed: ["type"] };
  const template = await getMatterTypeTemplate(input.typeId);
  if (!template) return { ok: false, failed: ["type"] };
  const allowedDocuments = new Set(template.documents.map((d) => d.id));
  const documentIds = input.documentIds.filter((id) => allowedDocuments.has(id));

  const typeSet = await setMatterType(input.matterId, input.typeId);
  if (!typeSet.ok) return { ok: false, failed: ["type"] };
  if (input.applySteps && !(await applyTemplateSteps(input.matterId)).ok) failed.push("steps");
  if (input.officeId && !(await setMatterOffice(input.matterId, input.officeId)).ok) failed.push("office");

  const team: [string, TeamRole][] = [];
  if (input.responsibleId) team.push([input.responsibleId, "responsible"]);
  for (const id of input.collaboratorIds) if (id !== input.responsibleId) team.push([id, "collaborator"]);
  for (const [id, role] of team) {
    const r = await addTeamMember(input.matterId, id, role);
    if (!r.ok && r.code !== "DUPLICATE") failed.push("team");
  }

  if (input.clientId) {
    const { data: client } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", input.clientId)
      .eq("role", "client")
      .maybeSingle();
    const granted = client ? await grantMatterAccess(input.matterId, client.email, input.accessLevel) : null;
    if (!granted || (!granted.ok && granted.code !== "DUPLICATE")) failed.push("access");
    else
      for (const documentId of documentIds) {
        const r = await createDocumentRequest(input.matterId, {
          clientId: input.clientId,
          templateDocumentId: documentId,
          title: "",
          description: "",
          dueDate: input.documentsDue,
        });
        if (!r.ok) failed.push("requests");
      }
  }

  for (const d of input.deliverables) {
    const r = await addDeliverable(input.matterId, {
      title: d.title,
      description: "",
      dueDate: d.dueDate,
      ownerId: input.responsibleId,
      visible: true,
    });
    if (!r.ok) failed.push("deliverables");
  }

  await recordAudit({
    action: "matter.opened",
    resourceType: "matter",
    resourceId: input.matterId,
    matterId: input.matterId,
    actorId: user?.id ?? null,
    metadata: { matter_type_id: input.typeId, office_id: input.officeId, failed: [...new Set(failed)] },
  });
  return { ok: failed.length === 0, failed: [...new Set(failed)] };
}
