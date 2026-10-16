import { Briefcase, MessageSquare, SearchX } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DocumentList } from "@/components/portal/lists";
import { SearchForm } from "@/components/portal/search-form";
import { EmptyState, InfoNote, PageHeader, SectionCard } from "@/components/portal/ui";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { Link } from "@/i18n/navigation";
import { requireClientSession } from "@/server/auth/session";
import { searchPortal, searchQuerySchema } from "@/server/services/search";

/** Recherche globale du client : dossiers, documents, messages (RLS : ce qu'il voit déjà). */
export default async function SearchPage({ params, searchParams }: PageProps<"/[locale]/portal/search">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireClientSession(locale, `/${locale}/portal/search`);
  const sp = await searchParams;
  const raw = typeof sp.q === "string" ? sp.q : "";
  const parsed = searchQuerySchema.safeParse(raw);
  const t = await getTranslations("portal.search");
  const results = parsed.success ? await searchPortal(parsed.data) : null;
  const ok = results?.status === "ok" ? results : null;
  const total = ok ? ok.matters.length + ok.documents.length + ok.conversations.length : 0;
  const isMock = Boolean(ok?.matters.some((m) => m.is_mock) || ok?.documents.some((d) => d.matters?.is_mock));

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={ok ? t("resultsFor", { query: parsed.data!, count: total }) : t("subtitle")}
        actions={isMock ? <DemoDataBadge /> : null}
      />
      <SearchForm
        locale={locale}
        id="search-page"
        defaultValue={raw.slice(0, 100)}
        className="mb-6 max-w-xl"
      />

      {!parsed.success ? (
        raw.trim() ? (
          <InfoNote>{t("tooShort")}</InfoNote>
        ) : (
          <InfoNote>{t("hint")}</InfoNote>
        )
      ) : results?.status === "rate_limited" ? (
        <InfoNote>{t("rateLimited")}</InfoNote>
      ) : ok && total === 0 ? (
        <SectionCard>
          <EmptyState icon={SearchX} message={t("none")} />
        </SectionCard>
      ) : ok ? (
        <div className="space-y-6">
          {ok.matters.length > 0 ? (
            <SectionCard title={t("groups.matters")}>
              <ul className="divide-y divide-gray-100">
                {ok.matters.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/portal/matters/${m.id}`}
                      className="-mx-2 flex items-center gap-3 rounded-[2px] px-2 py-3 hover:bg-surface focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
                    >
                      <Briefcase aria-hidden className="size-5 shrink-0 text-gold-ink" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-marine">{m.title}</span>
                        <span className="block text-xs text-ink-muted">{m.display_number}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
          {ok.documents.length > 0 ? (
            <SectionCard title={t("groups.documents")}>
              <DocumentList documents={ok.documents} />
            </SectionCard>
          ) : null}
          {ok.conversations.length > 0 ? (
            <SectionCard title={t("groups.messages")}>
              <ul className="divide-y divide-gray-100">
                {ok.conversations.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/portal/messages/${c.id}`}
                      className="-mx-2 flex items-center gap-3 rounded-[2px] px-2 py-3 hover:bg-surface focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
                    >
                      <MessageSquare aria-hidden className="size-5 shrink-0 text-gold-ink" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-marine">
                          {c.subject ?? t("noSubject")}
                        </span>
                        {c.matter_number && !c.subject?.includes(c.matter_number) ? (
                          <span className="block text-xs text-ink-muted">{c.matter_number}</span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
