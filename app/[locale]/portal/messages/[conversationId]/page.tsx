import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MessageComposer } from "@/components/portal/message-forms";
import { PageHeader, SectionCard } from "@/components/portal/ui";
import { Link } from "@/i18n/navigation";
import { formatDateTime, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { sendMessageAction } from "@/server/actions/portal";
import { requireClientSession } from "@/server/auth/session";
import { canWriteMatter } from "@/server/services/access-control";
import { getConversation, markConversationRead } from "@/server/services/messaging";

export default async function ConversationPage({
  params,
}: PageProps<"/[locale]/portal/messages/[conversationId]">) {
  const { locale, conversationId } = await params;
  setRequestLocale(locale);
  const { user } = await requireClientSession(locale, `/${locale}/portal/messages/${conversationId}`);
  const data = await getConversation(conversationId);
  if (!data) notFound();
  await markConversationRead(conversationId);
  const { conversation, messages, senders } = data;
  const canReply =
    !conversation.closed_at && (!conversation.matter_id || (await canWriteMatter(conversation.matter_id)));
  const t = await getTranslations("portal.messages");
  const matter = conversation.matters as unknown as { display_number: string | null; title: string } | null;
  const byId = new Map(senders.map((s) => [s.id, s]));

  return (
    <>
      <p className="mb-2 text-sm">
        <Link
          href="/portal/messages"
          className="inline-flex min-h-6 items-center text-gold-ink hover:underline"
        >
          ← {t("backToList")}
        </Link>
      </p>
      <PageHeader
        title={conversation.subject ?? matter?.title ?? t("title")}
        subtitle={matter?.display_number ?? undefined}
      />
      <SectionCard>
        {messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">{t("emptyThread")}</p>
        ) : (
          <ol className="space-y-4">
            {messages.map((m) => {
              const mine = m.sender_id === user.id;
              const sender = byId.get(m.sender_id);
              // Jamais attribuer un message au cabinet sans le savoir : auteur non visible = libellé neutre.
              const fromFirm = sender && sender.role !== "client";
              const name = mine
                ? t("you")
                : fromFirm
                  ? [sender.title, sender.first_name, sender.last_name].filter(Boolean).join(" ") || t("firm")
                  : sender
                    ? [sender.first_name, sender.last_name].filter(Boolean).join(" ") || t("participant")
                    : t("participant");
              return (
                <li key={m.id} className={cn("flex gap-3", mine && "flex-row-reverse")}>
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      mine ? "bg-gold text-marine" : "bg-marine text-white",
                    )}
                  >
                    {initials(sender?.first_name, sender?.last_name, fromFirm ? "LC" : "·")}
                  </span>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-[4px] px-4 py-3",
                      mine ? "bg-marine text-white" : "bg-surface text-marine",
                    )}
                  >
                    <p className={cn("text-xs font-semibold", mine ? "text-white/80" : "text-ink-muted")}>
                      {name} · <time dateTime={m.created_at}>{formatDateTime(m.created_at, locale)}</time>
                    </p>
                    <p className="mt-1 text-sm whitespace-pre-wrap">{m.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </SectionCard>
      <div className="mt-6">
        {canReply ? (
          <SectionCard>
            <MessageComposer action={sendMessageAction} locale={locale} conversationId={conversationId} />
          </SectionCard>
        ) : (
          <p className="text-sm text-ink-muted">{conversation.closed_at ? t("closed") : t("readOnly")}</p>
        )}
      </div>
    </>
  );
}
