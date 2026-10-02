import "server-only";
import { z } from "zod";
import { isStaffEmail } from "@/lib/auth-constants";

// Mêmes exigences que Supabase Auth (config.toml) : ≥ 12 caractères, 4 classes.
export const passwordSchema = z
  .string()
  .min(12, "PASSWORD_TOO_SHORT")
  .max(128, "PASSWORD_TOO_LONG")
  .regex(/[a-z]/, "PASSWORD_WEAK")
  .regex(/[A-Z]/, "PASSWORD_WEAK")
  .regex(/[0-9]/, "PASSWORD_WEAK")
  .regex(/[^A-Za-z0-9]/, "PASSWORD_WEAK");

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email("EMAIL_INVALID"));

export const localeSchema = z.enum(["en", "fr"]);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
  locale: localeSchema,
  next: z.string().max(512).optional(),
});

export const totpCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "CODE_INVALID"),
  factorId: z.string().uuid().optional(),
  locale: localeSchema,
  next: z.string().max(512).optional(),
});

export const forgotPasswordSchema = z.object({ email: emailSchema, locale: localeSchema });

export const newPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string(), locale: localeSchema })
  .refine((v) => v.password === v.confirm, { message: "PASSWORD_MISMATCH", path: ["confirm"] });

export const acceptInvitationSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "TOKEN_INVALID"),
    password: passwordSchema,
    confirm: z.string(),
    locale: localeSchema,
  })
  .refine((v) => v.password === v.confirm, { message: "PASSWORD_MISMATCH", path: ["confirm"] });

export const createInvitationSchema = z.object({
  // Un client ne reçoit jamais une adresse du cabinet (revue J3, M3).
  email: emailSchema.refine((e) => !isStaffEmail(e), "STAFF_EMAIL"),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  preferredLanguage: localeSchema,
  matterIds: z.array(z.string().uuid()).min(1, "MATTER_REQUIRED").max(20),
  accessLevel: z.enum(["read", "read_write"]),
  locale: localeSchema,
});

export const provisionStaffSchema = z.object({
  email: emailSchema,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  role: z.enum(["staff", "firm_admin"]),
  locale: localeSchema,
});

/** Réinitialisation de la MFA d'un client par un firm_admin (ADR 0012). */
export const mfaResetSchema = z.object({
  email: emailSchema,
  verification: z.enum(["callback_known_number", "in_person_id"]),
  reason: z.enum(["lost_device", "new_device", "other"]),
  confirmed: z.literal("on"),
  locale: localeSchema,
});

/** Codes d'erreur internes, traduits dans l'interface (messages/*.json → auth.errors.*). */
export type AuthErrorCode =
  | "INVALID_CREDENTIALS"
  | "RATE_LIMITED"
  | "STAFF_USE_MICROSOFT"
  | "CODE_INVALID"
  | "PASSWORD_WEAK"
  | "PASSWORD_MISMATCH"
  | "INVITATION_INVALID"
  | "UNEXPECTED";
