"use client";

import { useEffect, useRef, useState } from "react";
import { FileSignature, FolderOpen, Search, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

type Hit = { id: string; label: string; detail: string | null; href: string };
type Results = { matters: Hit[]; contracts: Hit[]; clients: Hit[]; limited?: boolean };

/**
 * Recherche globale de l'espace cabinet (Ctrl K ou ⌘ K) : dossiers, contrats et, pour le firm_admin,
 * clients. Fenêtre native <dialog> (focus gardé, Échap pour fermer). Le serveur revérifie tout.
 */
export function StaffSearch({
  locale,
  search,
}: {
  locale: string;
  search: (locale: string, q: string) => Promise<Results>;
}) {
  const t = useTranslations("admin.search");
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mac, setMac] = useState(false);

  const open = () => {
    dialog.current?.showModal();
    setTimeout(() => input.current?.focus(), 0);
  };
  const close = () => dialog.current?.close();

  useEffect(() => {
    // Raccourci affiché selon le système (⌘ K sur Mac, Ctrl K ailleurs) ; lu après l'affichage.
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    const id = setTimeout(() => setMac(isMac), 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dialog.current?.open) close();
        else open();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setPending(true);
      setFailed(false);
      try {
        const r = await search(locale, term);
        if (!cancelled) setResults(r);
      } catch {
        // Session expirée ou réseau : message clair, jamais d'indicateur bloqué.
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setPending(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, locale, search]);

  const shown = q.trim().length >= 2 ? results : null;
  const groups: { key: "matters" | "contracts" | "clients"; icon: typeof FolderOpen }[] = [
    { key: "matters", icon: FolderOpen },
    { key: "contracts", icon: FileSignature },
    { key: "clients", icon: UserRound },
  ];
  const total = shown ? shown.matters.length + shown.contracts.length + shown.clients.length : 0;

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="flex h-10 w-full max-w-md min-w-0 items-center gap-2 rounded-[8px] border border-gray-200 bg-surface-alt px-3 text-left text-sm text-ink-muted hover:border-gold focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
      >
        <Search aria-hidden className="size-4 shrink-0" />
        <span className="hidden truncate sm:inline">{t("placeholder")}</span>
        <span className="sr-only sm:hidden">{t("open")}</span>
        <kbd className="ml-auto hidden rounded-[4px] border border-gray-300 px-1.5 text-[11px] text-ink-muted sm:inline">
          {mac ? t("shortcutMac") : t("shortcut")}
        </kbd>
      </button>
      <dialog
        ref={dialog}
        aria-label={t("title")}
        onClick={(e) => {
          if (e.target === dialog.current) close();
        }}
        className="m-auto mt-[10vh] w-[min(40rem,calc(100vw-2rem))] rounded-[8px] p-0 shadow-2xl backdrop:bg-marine/40"
      >
        <div className="flex items-center gap-2 border-b border-gray-100 px-4">
          <Search aria-hidden className="size-4 text-ink-muted" />
          <label htmlFor="staff-search" className="sr-only">
            {t("title")}
          </label>
          <input
            ref={input}
            id="staff-search"
            value={q}
            maxLength={80}
            autoComplete="off"
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("placeholder")}
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-marine outline-none"
          />
          <button type="button" onClick={close} className="text-xs text-ink-muted hover:text-marine">
            {t("close")}
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2" aria-live="polite">
          {failed ? (
            <p role="alert" className="px-3 py-6 text-center text-sm text-marine">
              {t("failed")}
            </p>
          ) : shown?.limited ? (
            <p role="alert" className="px-3 py-6 text-center text-sm text-marine">
              {t("limited")}
            </p>
          ) : !shown ? (
            <p className="px-3 py-6 text-center text-sm text-ink-muted">{t("hint")}</p>
          ) : total === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-muted">
              {pending ? t("searching") : t("none")}
            </p>
          ) : (
            groups.map(({ key, icon: Icon }) =>
              shown[key].length ? (
                <section key={key} aria-label={t(`groups.${key}`)} className="mb-2">
                  <p className="px-3 pt-2 pb-1 text-xs font-medium text-ink-muted">{t(`groups.${key}`)}</p>
                  <ul>
                    {shown[key].map((h) => (
                      <li key={h.id}>
                        <Link
                          href={h.href}
                          onClick={close}
                          className="flex items-center gap-3 rounded-[6px] px-3 py-2 text-sm text-marine hover:bg-cream focus-visible:bg-cream focus-visible:outline-none"
                        >
                          <Icon aria-hidden className="size-4 shrink-0 text-gold-ink" />
                          <span className="min-w-0 flex-1 truncate font-medium">{h.label}</span>
                          {h.detail ? (
                            <span className="shrink-0 text-xs text-ink-muted">{h.detail}</span>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null,
            )
          )}
        </div>
      </dialog>
    </>
  );
}
