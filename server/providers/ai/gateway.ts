import "server-only";

/**
 * AiDraftingGateway (ADR 0032, plan des contrats lot 5) — aide à la rédaction d'une section.
 * Règles : appelée par le serveur seulement ; le texte reçu est DÉJÀ masqué (aucune coordonnée du
 * client) ; la réponse est une proposition, jamais écrite sans validation de l'avocat ; rien n'est
 * journalisé de son contenu. Implémentations : MockAiDraftingGateway (simulateur). L'implémentation
 * OpenAI attend les décisions du cabinet (docs/plan-contrats.md §6).
 */
export const aiAssistKinds = ["draft", "rephrase", "simplify", "translate"] as const;
export type AiAssistKind = (typeof aiAssistKinds)[number];

export type AiAssistInput = {
  kind: AiAssistKind;
  /** Langue du contrat ; pour « translate », la langue cible est l'autre. */
  language: "fr" | "en";
  sectionTitle: string;
  /** Texte actuel de la section, masqué. */
  text: string;
  /** Consigne libre de l'avocat (facultative), masquée. */
  instruction: string;
};

export interface AiDraftingGateway {
  readonly isMock: boolean;
  /** Proposition en texte simple (paragraphes ; « - » pour une liste). */
  assist(input: AiAssistInput): Promise<string>;
}

export class AiError extends Error {
  constructor(readonly code: "UNAVAILABLE" | "RATE_LIMITED" | "UPSTREAM" | "BUDGET_EXCEEDED") {
    super(code);
  }
}
