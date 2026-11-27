import "server-only";
import { z } from "zod";

/**
 * Réponse de l'API Chat Completions d'OpenAI (ADR 0044) : seuls les champs utilisés sont lus.
 * Tout le reste est ignoré ; une réponse qui ne correspond pas est refusée (AGENTS.md §5).
 */
export const openAiChatResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable().optional(),
          refusal: z.string().nullable().optional(),
        }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
});

/** Gabarit renvoyé en JSON structuré (format imposé par le schéma envoyé à OpenAI). */
export const openAiTemplateSchema = z.object({
  sections: z
    .array(z.object({ title: z.string().trim().min(1).max(200), text: z.string().max(20_000) }))
    .min(1)
    .max(60),
});

/** Schéma JSON envoyé à OpenAI (sorties structurées, mode strict) ; aligné sur openAiTemplateSchema. */
export const openAiTemplateJsonSchema = {
  name: "contract_template",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["sections"],
    properties: {
      sections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "text"],
          properties: { title: { type: "string" }, text: { type: "string" } },
        },
      },
    },
  },
} as const;

/** Corps d'erreur d'OpenAI : seuls le code et le type servent au diagnostic (jamais le message). */
export const openAiErrorSchema = z.object({
  error: z.object({
    code: z.string().nullish(),
    type: z.string().nullish(),
  }),
});
