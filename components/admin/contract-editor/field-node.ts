import { Node, mergeAttributes } from "@tiptap/core";
import type { ContractFieldKey } from "@/lib/contract-doc";

/**
 * Champ d'un contrat (ADR 0032) : atome en ligne, rempli à partir de la fiche du contrat.
 * Jamais créé par un collage (parseHTML vide) : un texte collé ne peut pas fabriquer un faux champ.
 * Affichage : la valeur connue, sinon le libellé du champ, surligné « à compléter ».
 */
export type FieldDisplay = Record<ContractFieldKey, { label: string; value: string | null }>;

export const FieldNode = Node.create<{ display: FieldDisplay | null }>({
  name: "field",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addOptions() {
    return { display: null };
  },
  addAttributes() {
    return { key: { default: "client.name", rendered: false } };
  },
  parseHTML() {
    return [];
  },
  renderHTML({ node, HTMLAttributes }) {
    const key = node.attrs.key as ContractFieldKey;
    const shown = this.options.display?.[key];
    const missing = !shown?.value;
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-field": key,
        class: missing ? "contract-field contract-field-missing" : "contract-field",
        title: shown?.label ?? key,
      }),
      shown?.value || `‹ ${shown?.label ?? key} ›`,
    ];
  },
  renderText({ node }) {
    const key = node.attrs.key as ContractFieldKey;
    return this.options.display?.[key]?.value ?? `[${key}]`;
  },
});
