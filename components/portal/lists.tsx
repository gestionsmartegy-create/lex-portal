import { CalendarDays, CreditCard, Download, ExternalLink, FileText, MessageSquare } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import {
  formatBytes,
  formatCalendarDate,
  formatDate,
  formatDateTime,
  formatMoney,
  formatRelative,
} from "@/lib/format";
import type { DocumentStatus, InvoiceStatus } from "@/types/domain";
import type { AppointmentRow, ConversationSummary, DocumentRow, InvoiceRow } from "@/types/portal";
import { EmptyState } from "./ui";

const DOC_TONE: Record<DocumentStatus, StatusTone> = {
  uploaded: "pending",
  in_review: "pending",
  pending_signature: "urgent",
  signed: "completed",
  rejected: "urgent",
  accepted: "completed",
};

/** Documents : téléchargement EN FLUX par le serveur (/api/documents/…), jamais de lien SharePoint. */
export function DocumentList({ documents }: { documents: DocumentRow[] }) {
  const t = useTranslations("portal.documents");
  const locale = useLocale();
  if (documents.length === 0) return <EmptyState icon={FileText} message={t("none")} />;
  return (
    <ul className="divide-y divide-gray-100">
      {documents.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap">
          <FileText aria-hidden className="size-5 shrink-0 text-gold-ink" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-marine">{d.display_name}</p>
            <p className="text-xs text-ink-muted">
              {[
                d.matters?.display_number,
                formatDate(d.uploaded_at, locale),
                formatBytes(d.size_bytes, locale),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <StatusBadge tone={DOC_TONE[d.status]} label={t(`status.${d.status}`)} />
          <Button asChild variant="ghost" size="icon" className="size-11">
            {/* Lien vers une route serveur : navigation complète pour le téléchargement. */}
            <a
              href={`/api/documents/${d.id}/download`}
              aria-label={t("downloadLabel", { name: d.display_name })}
            >
              <Download aria-hidden className="size-4" />
            </a>
          </Button>
        </li>
      ))}
    </ul>
  );
}

const INVOICE_TONE: Record<InvoiceStatus, StatusTone> = {
  due: "urgent",
  overdue: "urgent",
  paid: "completed",
  void: "pending",
};

export function InvoiceList({ invoices }: { invoices: InvoiceRow[] }) {
  const t = useTranslations("portal.billing");
  const locale = useLocale();
  if (invoices.length === 0) return <EmptyState icon={CreditCard} message={t("none")} />;
  return (
    <ul className="divide-y divide-gray-100">
      {invoices.map((inv) => {
        const payable = inv.status === "due" || inv.status === "overdue";
        return (
          <li key={inv.id} className="flex flex-wrap items-center gap-3 py-4 sm:flex-nowrap">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-marine">{inv.invoice_number}</p>
              <p className="text-xs text-ink-muted">
                {[
                  inv.matters?.display_number,
                  inv.issued_at ? t("issued", { date: formatCalendarDate(inv.issued_at, locale) }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-lg font-bold text-marine">
                {formatMoney(inv.amount_total, locale, inv.currency)}
              </p>
              {payable ? (
                <p className="text-xs text-ink-muted">
                  {t("balanceValue", { amount: formatMoney(inv.balance_due, locale, inv.currency) })}
                </p>
              ) : null}
            </div>
            <StatusBadge tone={INVOICE_TONE[inv.status]} label={t(`status.${inv.status}`)} />
            {payable ? (
              <span className="flex flex-col items-end gap-1">
                <Button variant="primary" size="sm" disabled aria-describedby={`pay-soon-${inv.id}`}>
                  {t("pay")}
                </Button>
                <span id={`pay-soon-${inv.id}`} className="text-[11px] text-ink-muted">
                  {t("paySoon")}
                </span>
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function AppointmentList({ appointments }: { appointments: AppointmentRow[] }) {
  const t = useTranslations("portal.appointments");
  const locale = useLocale();
  if (appointments.length === 0) return <EmptyState icon={CalendarDays} message={t("none")} />;
  return (
    <ul className="divide-y divide-gray-100">
      {appointments.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-3 py-4 sm:flex-nowrap">
          <CalendarDays aria-hidden className="size-5 shrink-0 text-gold-ink" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-marine">{a.title}</p>
            <p className="text-xs text-ink-muted">
              {[
                formatDateTime(a.starts_at, locale, a.timezone),
                a.with_staff_name ? t("with", { name: a.with_staff_name }) : null,
                a.location,
                a.matters?.display_number,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {a.meeting_url && /^https:\/\//.test(a.meeting_url) ? (
              <Button asChild variant="outline-gold" size="sm">
                <a href={a.meeting_url} target="_blank" rel="noopener noreferrer">
                  {t("join")} <ExternalLink aria-hidden className="size-3.5" />
                </a>
              </Button>
            ) : null}
            <Button asChild variant="ghost" size="sm">
              <a href={`/api/appointments/${a.id}/ics`}>{t("addToCalendar")}</a>
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ConversationList({ conversations }: { conversations: ConversationSummary[] }) {
  const t = useTranslations("portal.messages");
  const locale = useLocale();
  if (conversations.length === 0) return <EmptyState icon={MessageSquare} message={t("none")} />;
  return (
    <ul className="divide-y divide-gray-100">
      {conversations.map((c) => (
        <li key={c.id}>
          <Link
            href={`/portal/messages/${c.id}`}
            className={`-mx-2 flex gap-3 rounded-[2px] px-2 py-3 hover:bg-surface ${c.unread ? "bg-gold-pale/40" : ""}`}
          >
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-marine text-xs font-bold text-white"
            >
              LC
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-marine">
                  {c.subject ?? c.matters?.title}
                  {c.unread ? <span className="sr-only"> — {t("unread")}</span> : null}
                </span>
                {c.lastMessage ? (
                  <span className="shrink-0 text-xs text-ink-muted">
                    {formatRelative(c.lastMessage.created_at, locale)}
                  </span>
                ) : null}
              </span>
              <span className="block text-xs text-ink-muted">{c.matters?.display_number}</span>
              {c.lastMessage ? (
                <span className="mt-0.5 line-clamp-2 block text-xs text-ink-muted">{c.lastMessage.body}</span>
              ) : null}
            </span>
            {c.unread ? <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-gold" /> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
