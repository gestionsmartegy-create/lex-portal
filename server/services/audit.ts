import "server-only";
import type { Json } from "@/types/database";
import { createSupabaseServiceClient } from "@/server/db/service-client";
import { getRequestContext } from "@/server/security/request-context";

export type AuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.mfa_enrolled"
  | "auth.mfa_failed"
  | "auth.logout"
  | "auth.logout_all"
  | "auth.session_timeout"
  | "auth.mfa_reset"
  | "auth.password_reset_requested"
  | "auth.password_changed"
  | "document.downloaded"
  | "message.sent"
  | "conversation.closed"
  | "matter_access.granted"
  | "matter_access.revoked"
  | "invitation.revoked"
  | "invitation.resent"
  | "profile.suspended"
  | "profile.reactivated"
  | "profile.updated"
  | "integration.connected"
  | "integration.disconnected"
  | "integration.imported"
  | "integration.synced"
  | "invitation.sent"
  | "staff.provisioned";

type AuditInput = {
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  matterId?: string | null;
  actorId?: string | null;
  /** Jamais d'e-mail, de nom, de mot de passe ni de jeton (AGENTS.md §5). */
  metadata?: Record<string, Json>;
};

/**
 * Écrit dans audit.events via la RPC record_audit_event (service_role, AGENTS.md §6).
 * Un échec d'audit est journalisé côté serveur mais n'interrompt pas l'action
 * en cours ; les événements de droits critiques sont, eux, écrits par triggers
 * en base (non contournables).
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  const ctx = await getRequestContext();
  const { error } = await createSupabaseServiceClient().rpc("record_audit_event", {
    p_action: input.action,
    p_resource_type: input.resourceType,
    p_resource_id: input.resourceId ?? undefined,
    p_matter_id: input.matterId ?? undefined,
    p_metadata: input.metadata ?? {},
    p_actor_id: input.actorId ?? undefined,
    p_ip: ctx.ip ?? undefined,
    p_user_agent: ctx.userAgent ?? undefined,
    p_request_id: ctx.requestId ?? undefined,
  });
  if (error)
    console.error(JSON.stringify({ event: "audit_write_failed", action: input.action, code: error.code }));
}
