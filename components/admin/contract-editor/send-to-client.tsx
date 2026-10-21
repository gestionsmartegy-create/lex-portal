"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Envoi au client (ADR 0035) : possible pour tout membre de l'équipe qui tient le verrou, si le contrat
 * est lié à un client qui a un compte et qu'aucun champ n'est vide. Le mode de signature vient du
 * modèle, ou se choisit ici (« au choix »). La base fige une version et revérifie tout.
 */
export function SendToClient({
  busy,
  hasClientAccount,
  missingLabels,
  templateSigning,
  onSend,
}: {
  busy: boolean;
  hasClientAccount: boolean;
  missingLabels: string[];
  templateSigning: "clio" | "portal" | "both" | null;
  onSend: (mode: "clio" | "portal") => void;
}) {
  const t = useTranslations("admin.contracts.editor.send");
  const fixed = templateSigning === "clio" || templateSigning === "portal" ? templateSigning : null;
  const [mode, setMode] = useState<"clio" | "portal">(fixed ?? "portal");
  const blocked = !hasClientAccount || missingLabels.length > 0;

  return (
    <div className="space-y-2 border-t border-gray-100 pt-3">
      <h3 className="text-sm font-semibold text-marine">{t("title")}</h3>
      {!hasClientAccount ? <p className="text-xs text-ink-muted">{t("needsAccount")}</p> : null}
      {missingLabels.length ? (
        <p className="text-xs text-ink-muted">{t("needsFields", { fields: missingLabels.join(", ") })}</p>
      ) : null}
      {fixed ? (
        <p className="text-xs text-ink-muted">{t("modeFixed", { mode: t(`modes.${fixed}`) })}</p>
      ) : (
        <fieldset className="space-y-1">
          <legend className="text-xs font-semibold text-marine">{t("modeLabel")}</legend>
          {(["portal", "clio"] as const).map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm text-marine">
              <input
                type="radio"
                name="send-mode"
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
                className="size-4 accent-marine"
              />
              {t(`modes.${m}`)}
            </label>
          ))}
        </fieldset>
      )}
      <button
        type="button"
        disabled={busy || blocked}
        onClick={() => {
          if (window.confirm(t("confirm"))) onSend(fixed ?? mode);
        }}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[8px] bg-marine px-4 text-sm font-semibold text-white hover:bg-marine/90 focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none disabled:opacity-50"
      >
        <Send aria-hidden className="size-4" />
        {t("button")}
      </button>
      <p className="text-xs text-ink-muted">{t("help")}</p>
    </div>
  );
}
