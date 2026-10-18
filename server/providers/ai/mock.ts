import "server-only";
import type { AiAssistInput, AiDraftingGateway } from "./gateway";

/**
 * Simulateur d'IA (AGENTS.md §2.6-7) : aucune requête externe. Les propositions sont des textes
 * fixes, clairement marqués « Simulateur », pour montrer le parcours avant le branchement d'OpenAI.
 */
const DRAFT = {
  fr: (title: string) =>
    [
      `[Simulateur IA] Proposition pour « ${title} » :`,
      "Le Cabinet s'engage à exécuter le mandat avec diligence et compétence, conformément aux règles de déontologie applicables.",
      "Le Client s'engage à fournir au Cabinet, en temps utile, tous les renseignements et documents nécessaires.",
      "- Les parties conviennent de communiquer par écrit pour toute modification du mandat.",
      "- Toute modification fera l'objet d'un avenant signé par les deux parties.",
    ].join("\n"),
  en: (title: string) =>
    [
      `[AI simulator] Proposal for "${title}":`,
      "The Firm undertakes to carry out the mandate diligently and competently, in accordance with the applicable rules of professional conduct.",
      "The Client undertakes to provide the Firm, in a timely manner, with all necessary information and documents.",
      "- The parties agree to communicate in writing regarding any change to the mandate.",
      "- Any change will be set out in an amendment signed by both parties.",
    ].join("\n"),
};

export class MockAiDraftingGateway implements AiDraftingGateway {
  readonly isMock = true;
  async assist(input: AiAssistInput): Promise<string> {
    const fr = input.language === "fr";
    const body = input.text.trim();
    switch (input.kind) {
      case "draft":
        return DRAFT[input.language](input.sectionTitle || (fr ? "Section" : "Section"));
      case "rephrase":
        return `${fr ? "[Simulateur IA] Version reformulée :" : "[AI simulator] Rephrased version:"}\n${body}`;
      case "simplify":
        return `${fr ? "[Simulateur IA] Version simplifiée :" : "[AI simulator] Simplified version:"}\n${body}`;
      case "translate":
        return `${fr ? "[AI simulator] English translation:" : "[Simulateur IA] Traduction française :"}\n${body}`;
    }
  }
}
