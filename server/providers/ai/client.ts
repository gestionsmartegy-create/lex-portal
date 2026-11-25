import "server-only";
import {
  AiError,
  type AiAssistInput,
  type AiAssistKind,
  type AiDraftingGateway,
  type AiTemplate,
  type AiTemplateInput,
} from "./gateway";
import { openAiChatResponseSchema, openAiTemplateJsonSchema, openAiTemplateSchema } from "./schemas";

/**
 * Assistant de rédaction branché sur OpenAI (ADR 0044), appelé par le serveur seulement.
 * - Le texte reçu est DÉJÀ masqué par l'appelant (ADR 0037) ; le plafond et le journal sont gérés
 *   par l'appelant (ai_reserve / ai_complete). Ce client n'enregistre jamais le texte ni la réponse.
 * - `store: false` : l'échange n'est pas gardé dans l'historique du compte OpenAI.
 * - Erreurs : codes internes seulement (AiError), jamais la réponse brute ni la clé.
 * Point d'accès : POST https://api.openai.com/v1/chat/completions (API publique d'OpenAI).
 */
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
/**
 * Les modèles « à raisonnement » (gpt-5-mini) comptent leur réflexion dans les jetons de sortie et
 * répondent plus lentement : marges larges, sous la durée maximale d'une fonction chez l'hébergeur.
 */
const ASSIST_TIMEOUT_MS = 45_000;
const TEMPLATE_TIMEOUT_MS = 90_000;
const MAX_OUTPUT_TOKENS = 8_000;
const MAX_TEMPLATE_TOKENS = 16_000;

const LANGUAGE_NAME = { fr: "français", en: "anglais" } as const;

const TASK: Record<AiAssistKind, string> = {
  draft: "Rédige le texte de cette section de contrat.",
  rephrase: "Reformule le texte de cette section, plus clairement, sans en changer le sens juridique.",
  simplify: "Simplifie le texte de cette section en langage clair, sans en changer le sens juridique.",
  translate: "Traduis fidèlement le texte de cette section.",
};

/** Règles communes : sortie en texte simple, éléments masqués conservés, aucune invention de faits. */
const RULES = [
  "Tu aides un cabinet d'avocats canadien (Lex Canada Law) à rédiger des contrats de services juridiques.",
  "Réponds uniquement par le texte demandé, sans introduction ni commentaire.",
  "Texte simple : des paragraphes séparés par une ligne ; « - » en début de ligne pour une liste ; aucun titre, gras ni Markdown.",
  "Conserve exactement les éléments entre crochets (par exemple [client_name] ou [masqué]) : ce sont des champs ou des données masquées.",
  "N'invente ni nom, ni montant, ni date, ni fait qui ne figure pas dans la demande.",
].join("\n");

type ChatMessage = { role: "system" | "user"; content: string };

export class OpenAiDraftingGateway implements AiDraftingGateway {
  readonly isMock = false;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async assist(input: AiAssistInput): Promise<string> {
    const target = input.kind === "translate" ? (input.language === "fr" ? "en" : "fr") : input.language;
    const user = [
      TASK[input.kind],
      `Langue de la réponse : ${LANGUAGE_NAME[target]}.`,
      `Titre de la section : ${input.sectionTitle || "(sans titre)"}`,
      input.instruction.trim() ? `Consigne de l'avocat : ${input.instruction.trim()}` : null,
      input.text.trim() ? `Texte actuel :\n"""\n${input.text}\n"""` : "Texte actuel : (vide)",
    ]
      .filter((line): line is string => line !== null)
      .join("\n");
    const text = await this.complete([
      { role: "system", content: RULES },
      { role: "user", content: user },
    ]);
    const trimmed = text.trim();
    if (!trimmed) throw new AiError("UPSTREAM");
    return trimmed;
  }

  async generateTemplate(input: AiTemplateInput): Promise<AiTemplate> {
    const user = [
      "Propose un gabarit de contrat de services juridiques, découpé en sections (titre et texte).",
      `Langue : ${LANGUAGE_NAME[input.language]}.`,
      `Domaine de droit : ${input.domain}.`,
      `Description du contrat voulu :\n"""\n${input.description}\n"""`,
      "Inclus au minimum : les parties, l'objet du mandat, les honoraires et débours, les obligations, la confidentialité, la fin du mandat et les signatures.",
      "Ce gabarit sera relu par un avocat avant toute utilisation.",
    ].join("\n");
    const raw = await this.complete(
      [
        { role: "system", content: RULES },
        { role: "user", content: user },
      ],
      {
        maxTokens: MAX_TEMPLATE_TOKENS,
        timeoutMs: TEMPLATE_TIMEOUT_MS,
        json: true,
      },
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new AiError("UPSTREAM");
    }
    const result = openAiTemplateSchema.safeParse(parsed);
    if (!result.success) throw new AiError("UPSTREAM");
    return result.data;
  }

  /** Un appel Chat Completions ; renvoie le texte de la première réponse. */
  private async complete(
    messages: ChatMessage[],
    options: { maxTokens?: number; timeoutMs?: number; json?: boolean } = {},
  ): Promise<string> {
    let res: Response;
    try {
      res = await this.fetchImpl(OPENAI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          store: false,
          max_completion_tokens: options.maxTokens ?? MAX_OUTPUT_TOKENS,
          ...(options.json
            ? { response_format: { type: "json_schema", json_schema: openAiTemplateJsonSchema } }
            : {}),
        }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(options.timeoutMs ?? ASSIST_TIMEOUT_MS),
      });
    } catch {
      throw new AiError("UPSTREAM");
    }
    if (res.status === 429 || res.status === 503) throw new AiError("RATE_LIMITED");
    // 401/403 : clé absente, révoquée ou sans droits ; 400/404 : modèle ou paramètres refusés.
    if (!res.ok) throw new AiError("UNAVAILABLE");
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new AiError("UPSTREAM");
    }
    const parsed = openAiChatResponseSchema.safeParse(body);
    if (!parsed.success) throw new AiError("UPSTREAM");
    const choice = parsed.data.choices[0];
    // Refus du modèle, réponse coupée ou vide : jamais une proposition partielle.
    if (!choice || choice.message.refusal || choice.finish_reason === "length" || !choice.message.content)
      throw new AiError("UPSTREAM");
    return choice.message.content;
  }
}
