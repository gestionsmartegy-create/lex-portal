"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Aide « ? » à côté d'un titre (décision UX du 2026-10-18) : remplace les bandeaux d'explication
 * permanents. S'ouvre au clic, au toucher et au clavier ; se ferme avec Échap ou en cliquant ailleurs.
 */
export function HelpTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <span ref={box} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-6 items-center justify-center rounded-full border border-gold bg-cream text-xs font-bold text-gold-ink hover:bg-gold-pale focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
      >
        ?
      </button>
      {open ? (
        <span
          id={id}
          role="note"
          className="absolute top-8 left-0 z-40 w-72 max-w-[80vw] rounded-[8px] bg-marine px-3.5 py-3 text-left text-[13px] leading-relaxed font-normal text-white shadow-lg"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
