import { MessageSquare } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { NewConversationForm } from "@/components/portal/message-forms";
import { TabLinks } from "@/components/portal/tab-links";
import { EmptyState, PageHeader, SectionCard } from "@/components/portal/ui";
import { StatusBadge } from "@/components/shared/status-badge";
import { Link } from "@/i18n/navigation";
import { formatRelative } from "@/lib/format";
import { staffStartConversationAction } from "@/server/actions/admin";
import { requireStaff } from "@/server/auth/session";
import { listAdminMatters } from "@/server/services/admin";
import { listStaffConversations } from "@/server/services/messaging";

// Messagerie du cabinet (J7, ADR 0017) : fils des dossiers de l'équipe (RLS), ou de tous pour un firm_admin.
export default async function AdminMessagesPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/messages">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff(locale);
  const sp = await searchParams;
  const unreadOnly = sp.filter !== "all";
  const [t, conversations, matters] = await Promise.all([
    getTranslations("admin.messages"),
    listStaffConversations({ unreadOnly }),
    listAdminMatters(),
  ]);

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <TabLinks
            label={t("filters.label")}
            items={[
              { href: "/admin/messages", label: t("filters.unread"), active: unreadOnly },
              { href: "/admin/messages?filter=all", label: t("filters.all"), active: !unreadOnly },
            ]}
          />
          <SectionCard>
            {conversations.length === 0 ? (
              <EmptyState icon={MessageSquare} message={unreadOnly ? t("noneUnread") : t("none")} />
            ) : (
              <ul className="divide-y divide-gray-100">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/admin/messages/${c.id}`}
                      className={`-mx-2 flex gap-3 rounded-[2px] px-2 py-3 hover:bg-surface ${c.unread ? "bg-gold-pale/40" : ""}`}
                    >
                      {c.unread ? (
                        <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-gold" />
                      ) : null}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium text-marine">
                            {c.subject ?? c.matter?.title}
                            {c.unread ? <span className="sr-only"> — {t("unread")}</span> : null}
                          </span>
                          {c.last_message_at ? (
                            <span className="shrink-0 text-xs text-ink-muted">
                              {formatRelative(c.last_message_at, locale)}
                            </span>
                          ) : null}
                        </span>
                        <span className="block text-xs text-ink-muted">
                          {[
                            c.matter?.display_number,
                            c.clients.length ? t("clients", { names: c.clients.join(", ") }) : t("noClient"),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      {c.closed_at ? <StatusBadge tone="completed" label={t("closedBadge")} /> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
        <SectionCard title={t("newTitle")} className="lg:col-span-2">
          <NewConversationForm
            action={staffStartConversationAction}
            locale={locale}
            namespace="admin.messages"
            matters={matters
              .filter((m) => m.status !== "closed")
              .map((m) => ({ id: m.id, label: [m.display_number, m.title].filter(Boolean).join(" — ") }))}
          />
        </SectionCard>
      </div>
    </>
  );
}
