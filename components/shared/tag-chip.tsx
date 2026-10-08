import { cn } from "@/lib/utils";

/** Couleurs des étiquettes (palette fermée, ADR 0021) : texte foncé sur fond clair, contraste AA. */
const TONES = {
  marine: "bg-marine/10 text-marine border-marine/20",
  gold: "bg-gold-pale text-gold-ink border-gold/30",
  red: "bg-red-50 text-red-800 border-red-200",
  orange: "bg-orange-50 text-orange-800 border-orange-200",
  green: "bg-green-50 text-green-800 border-green-200",
  blue: "bg-blue-50 text-blue-800 border-blue-200",
  purple: "bg-purple-50 text-purple-800 border-purple-200",
  gray: "bg-gray-100 text-gray-700 border-gray-200",
} as const;

export type TagTone = keyof typeof TONES;

export function TagChip({ label, color, className }: { label: string; color: TagTone; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[color] ?? TONES.gray,
        className,
      )}
    >
      {label}
    </span>
  );
}
