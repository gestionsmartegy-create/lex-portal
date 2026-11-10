import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Notice } from "@/components/admin/notice";
import { MessageComposer } from "@/components/portal/message-forms";
import { PageHeader, SectionCard } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatDateTime, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { closeConversationAction, staffSendMessageAction } from "@/server/actions/admin";
import { requireStaff } from "@/server/auth/session";
import { canWriteMatter } from "@/server/services/access-control";
import { openConversationAsStaff } from "@/server/services/messaging";

// Fil côté cabinet (J7, ADR 0017) : le membre de l'équipe rejoint le fil à l'ouverture ; sinon même 404.
export default async function AdminConversationPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/messages/[conversationId]">) {
  const { locale, conversationId } = await params;
  setRequestLocale(locale);
  const { user } = await requireStaff(locale);
  const sp = await searchParams;
  const data = await openConversationAsStaff(conversationId);
  if (!data) notFound();
  const { conversation, messages, senders } = data;
  const canReply =
    !conversation.closed_at && (!conversation.matter_id || (await canWriteMatter(conversation.matter_id)));
  const t = await getTranslations("admin.messages");
  const matter = conversation.matters as unknown as { display_number: string | null; title: string } | null;
  const byId = new Map(senders.map((s) => [s.id, s]));

  return (
    <>
      <p className="mb-2 text-sm">
        <Link
          href="/admin/messages?filter=all"
          className="inline-flex min-h-6 items-center text-gold-ink hover:underline"
        >
          ← {t("back")}
        </Link>
      </p>
      <PageHeader
        title={conversation.subject ?? matter?.title ?? t("title")}
        subtitle={[matter?.display_number, matter?.title].filter(Boolean).join(" · ")}
        actions={
          canReply ? (
            <form action={closeConversationAction}>
              <input type="hidden" name="id" value={conversation.id} />
              <input type="hidden" name="locale" value={locale} />
              <Button type="submit" variant="outline-gold" size="brand">
                {t("close")}
              </Button>
            </form>
          ) : null
        }
      />
      <Notice message={sp.notice === "closed" ? t("closedNotice") : undefined} />
      <SectionCard>
        <ol className="space-y-4">
          {messages.map((m) => {
            const mine = m.sender_id === user.id;
            const sender = byId.get(m.sender_id);
            const isClient = sender?.role === "client";
            const name = mine
              ? t("you")
              : sender
                ? [sender.first_name, sender.last_name].filter(Boolean).join(" ") ||
                  (isClient ? t("client") : t("firm"))
                : t("firm");
            return (
              <li key={m.id} className={cn("flex gap-3", mine && "flex-row-reverse")}>
                <span
                  aria-hidden
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    isClient ? "bg-gold text-marine" : "bg-marine text-white",
                  )}
                >
                  {initials(sender?.first_name, sender?.last_name, isClient ? "C" : "LC")}
                </span>
                <div
                  className={cn(
                    "max-w-[80%] rounded-[4px] px-4 py-3",
                    mine ? "bg-marine text-white" : "bg-surface text-marine",
                  )}
                >
                  <p className={cn("text-xs font-semibold", mine ? "text-white/80" : "text-ink-muted")}>
                    {name}
                    {isClient ? ` · ${t("client")}` : ""} ·{" "}
                    <time dateTime={m.created_at}>{formatDateTime(m.created_at, locale)}</time>
                  </p>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{m.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </SectionCard>
      <div className="mt-6">
        {canReply ? (
          <SectionCard>
            <MessageComposer
              action={staffSendMessageAction}
              locale={locale}
              conversationId={conversation.id}
              namespace="admin.messages"
            />
          </SectionCard>
        ) : (
          <p className="text-sm text-ink-muted">{t("closed")}</p>
        )}
      </div>
    </>
  );
}
