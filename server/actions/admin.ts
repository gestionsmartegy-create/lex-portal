"use server";

import "server-only";
import { requireStaff } from "@/server/auth/session";
import { hitRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import { createInvitation } from "@/server/services/invitation";
import { provisionStaff } from "@/server/services/staff";
import { createInvitationSchema, provisionStaffSchema } from "@/server/validation/auth";

export type AdminActionState = {
  error?: "INVALID" | "DUPLICATE" | "EXISTS" | "DOMAIN" | "RATE_LIMITED" | "FAILED";
  ok?: boolean;
};

/** Invitation d'un client (firm_admin). Le rôle est revérifié ici ET par la RLS. */
export async function createInvitationAction(_prev: unknown, formData: FormData): Promise<AdminActionState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = createInvitationSchema.safeParse({ ...raw, matterIds: formData.getAll("matterIds") });
  if (!parsed.success) return { error: "INVALID" };
  const { user } = await requireStaff(parsed.data.locale, ["firm_admin"]);
  if (!(await hitRateLimit(`invite:user:${user.id}`, RATE_LIMITS.invitationCreateByUser)))
    return { error: "RATE_LIMITED" };

  const result = await createInvitation(
    {
      email: parsed.data.email,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      preferredLanguage: parsed.data.preferredLanguage,
      matterIds: parsed.data.matterIds,
      accessLevel: parsed.data.accessLevel,
    },
    user.id,
  );
  return result.ok ? { ok: true } : { error: result.code === "DUPLICATE" ? "DUPLICATE" : "FAILED" };
}

/** Pré-création d'un compte du personnel (firm_admin). */
export async function provisionStaffAction(_prev: unknown, formData: FormData): Promise<AdminActionState> {
  const parsed = provisionStaffSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "INVALID" };
  const { user } = await requireStaff(parsed.data.locale, ["firm_admin"]);
  const result = await provisionStaff(
    {
      email: parsed.data.email,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      role: parsed.data.role,
    },
    user.id,
  );
  if (result.ok) return { ok: true };
  return { error: result.code === "EXISTS" ? "EXISTS" : result.code === "DOMAIN" ? "DOMAIN" : "FAILED" };
}
