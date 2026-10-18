"use client";

import { Printer } from "lucide-react";

/** Ouvre l'impression du navigateur (« Enregistrer en PDF » possible). */
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-marine px-4 text-sm font-semibold text-white hover:bg-marine/90 focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
    >
      <Printer aria-hidden className="size-4" />
      {label}
    </button>
  );
}
