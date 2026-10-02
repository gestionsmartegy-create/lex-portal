import { getTranslations, setRequestLocale } from "next-intl/server";
import { ConversationList } from "@/components/portal/lists";
import { PageHeader, SectionCard } from "@/components/portal/ui";
import { requireClientSession } from "@/server/auth/session";
import { listConversations } from "@/server/services/messaging";

export default async function MessagesPage({ params }: PageProps<"/[locale]/portal/messages">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireClientSession(locale, `/${locale}/portal/messages`);
  const [t, conversations] = await Promise.all([getTranslations("portal.messages"), listConversations()]);
  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <SectionCard>
        <ConversationList conversations={conversations} />
      </SectionCard>
    </>
  );
}
