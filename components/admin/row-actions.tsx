"use client";

import { useState, type ReactNode } from "react";
import { MoreHorizontal, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type RowPanel = { key: string; label: string; danger?: boolean; content: ReactNode };

/**
 * Actions d'une ligne (ADR 0033) : une action principale visible, les autres dans un menu « ⋯ ».
 * Choisir une action ouvre son panneau (formulaire rendu par le serveur) sous la ligne.
 */
export function RowActions({
  primary,
  panels,
  moreLabel,
  closeLabel,
}: {
  primary?: ReactNode;
  panels: RowPanel[];
  moreLabel: string;
  closeLabel: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const current = panels.find((p) => p.key === open);
  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
        {primary}
        {panels.length ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={moreLabel}
                className="inline-flex size-9 items-center justify-center rounded-[8px] border border-gray-300 bg-white text-marine hover:border-gold hover:bg-cream focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
              >
                <MoreHorizontal aria-hidden className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {panels.map((p) => (
                <DropdownMenuItem
                  key={p.key}
                  onSelect={() => setOpen(p.key)}
                  className={cn(
                    "py-2 text-sm",
                    p.danger
                      ? "font-semibold text-[#B91C1C] focus:bg-status-urgent/10 focus:text-[#B91C1C]"
                      : "text-marine",
                  )}
                >
                  {p.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {current ? (
        <div className="relative mt-3 basis-full rounded-[8px] border border-gray-200 bg-surface-alt p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-marine">{current.label}</p>
            <button
              type="button"
              onClick={() => setOpen(null)}
              aria-label={closeLabel}
              className="inline-flex size-8 items-center justify-center rounded-[6px] text-ink-muted hover:bg-white hover:text-marine focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
          {current.content}
        </div>
      ) : null}
    </>
  );
}
