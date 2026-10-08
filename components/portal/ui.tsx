import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** Briques d'interface du portail (docs/design-system.md §3 et §5). Composants serveur. */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[28px] leading-tight font-extrabold text-marine">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}

export function SectionCard({
  title,
  action,
  children,
  className,
  headingLevel = 2,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section className={cn("rounded-[4px] border border-gray-100 bg-white", className)}>
      {title ? (
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 sm:px-6">
          <Heading className="font-display text-lg font-bold text-marine">{title}</Heading>
          {action}
        </div>
      ) : null}
      <div className="px-5 py-4 sm:px-6">{children}</div>
    </section>
  );
}

export function ViewAllLink({ href }: { href: string }) {
  const t = useTranslations("portal.common");
  return (
    <Link
      href={href}
      className="inline-flex min-h-6 items-center text-xs font-medium text-gold-ink hover:underline"
    >
      {t("viewAll")} →
    </Link>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  href,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: "gold" | "blue" | "marine" | "red";
  href: string;
}) {
  const iconTone = {
    gold: "bg-gold/15 text-gold-ink",
    blue: "bg-status-pending/10 text-[#1D4ED8]",
    marine: "bg-marine/10 text-marine",
    red: "bg-status-urgent/10 text-[#B91C1C]",
  }[tone];
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-[4px] border border-gray-100 bg-white p-5 transition-shadow duration-300 hover:shadow-md"
    >
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-[4px]", iconTone)}>
        <Icon aria-hidden className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block font-display text-[clamp(22px,2.2vw,28px)] leading-none font-bold whitespace-nowrap text-marine tabular-nums">
          {value}
        </span>
        <span className="mt-1 block text-xs text-ink-muted">{label}</span>
      </span>
    </Link>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface"
      >
        <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-xs font-semibold text-marine tabular-nums">{pct}%</span>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  message,
  children,
}: {
  icon: LucideIcon;
  message: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-surface text-ink-muted">
        <Icon aria-hidden className="size-5" />
      </span>
      <p className="max-w-sm text-sm text-ink-muted">{message}</p>
      {children}
    </div>
  );
}

export function InfoNote({ children }: { children: ReactNode }) {
  return <p className="rounded-[2px] border border-gold/40 bg-cream p-3 text-sm text-marine">{children}</p>;
}
