"use client";

import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";

type Alert = { key: string; count: number; href: string };

/** Cloche de l'espace cabinet : ce qui demande une action, chacun avec son lien (ADR 0033). */
export function StaffAlerts({ alerts }: { alerts: Alert[] }) {
  const t = useTranslations("admin.alerts");
  const total = alerts.reduce((n, a) => n + a.count, 0);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex size-11 items-center justify-center rounded-[2px] text-marine hover:bg-surface"
          aria-label={total > 0 ? t("labelCount", { count: total }) : t("label")}
        >
          <Bell aria-hidden className="size-5" />
          {total > 0 ? (
            <span
              aria-hidden
              className="absolute top-2 right-2 flex size-4 items-center justify-center rounded-full bg-status-urgent text-[10px] font-bold text-white"
            >
              {total > 9 ? "9+" : total}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>{t("title")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {alerts.length === 0 ? (
          <p className="px-2 py-3 text-sm text-ink-muted">{t("none")}</p>
        ) : (
          alerts.map((a) => (
            <DropdownMenuItem key={a.key} asChild>
              <Link
                href={a.href}
                className="flex items-center justify-between gap-3 py-2 text-sm text-marine"
              >
                <span>{t(`items.${a.key}`, { count: a.count })}</span>
                <span className="rounded-full bg-cream px-2 py-0.5 text-xs font-semibold text-gold-ink">
                  {a.count}
                </span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/admin" className="text-sm font-medium text-gold-ink">
            {t("seeDay")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
