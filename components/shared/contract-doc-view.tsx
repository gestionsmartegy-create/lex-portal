import type { ReactNode } from "react";
import type { ContractDoc, ContractFieldKey, DocNode } from "@/lib/contract-doc";

/**
 * Rendu d'une section de contrat à partir de son JSON (ADR 0032) : LISTE BLANCHE de nœuds et de
 * marques, convertie en éléments React (jamais de HTML brut, jamais de dangerouslySetInnerHTML).
 * Un type inconnu est ignoré. Les champs vides sont surlignés « à compléter ».
 */
export function ContractDocView({
  doc,
  values,
  labels,
}: {
  doc: ContractDoc;
  values: Partial<Record<ContractFieldKey, string | null>>;
  labels: Record<ContractFieldKey, string>;
}) {
  const inline = (nodes: DocNode[] | undefined): ReactNode[] =>
    (nodes ?? []).map((n, i) => {
      if (n.type === "text") {
        let el: ReactNode = n.text ?? "";
        for (const m of n.marks ?? []) {
          if (m.type === "bold") el = <strong>{el}</strong>;
          else if (m.type === "italic") el = <em>{el}</em>;
        }
        return <span key={i}>{el}</span>;
      }
      if (n.type === "hardBreak") return <br key={i} />;
      if (n.type === "field") {
        const key = (n.attrs as { key: ContractFieldKey } | undefined)?.key;
        if (!key || !(key in labels)) return null;
        const value = values[key];
        return value ? (
          <span key={i} className="whitespace-pre-line">
            {value}
          </span>
        ) : (
          <mark key={i} className="contract-field-missing">
            ‹ {labels[key]} ›
          </mark>
        );
      }
      return null;
    });
  const blocks = (nodes: DocNode[] | undefined): ReactNode[] =>
    (nodes ?? []).map((n, i) => {
      switch (n.type) {
        case "paragraph":
          return <p key={i}>{inline(n.content)}</p>;
        case "heading":
          return (n.attrs as { level?: number } | undefined)?.level === 2 ? (
            <h3 key={i}>{inline(n.content)}</h3>
          ) : (
            <h4 key={i}>{inline(n.content)}</h4>
          );
        case "bulletList":
          return (
            <ul key={i}>
              {(n.content ?? []).map((li, j) => (
                <li key={j}>{blocks(li.content)}</li>
              ))}
            </ul>
          );
        case "orderedList":
          return (
            <ol key={i} start={(n.attrs as { start?: number } | undefined)?.start ?? 1}>
              {(n.content ?? []).map((li, j) => (
                <li key={j}>{blocks(li.content)}</li>
              ))}
            </ol>
          );
        default:
          return null;
      }
    });
  return <div className="contract-prose">{blocks(doc.content)}</div>;
}
