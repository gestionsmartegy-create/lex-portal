import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { Notice } from "@/components/admin/notice";
import { InfoNote, PageHeader, SectionCard } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { createClientRequestAction } from "@/server/actions/requests";
import { requireStaff } from "@/server/auth/session";
import { listRequestClients } from "@/server/services/document-requests";

const fieldClass =
  "w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";
const labelClass = "text-[13px] font-medium text-marine";
const NOTICES = ["invalid", "failed", "tooMany"] as const;

/**
 * Demander un document à un client (2026-10-20) : 1) le client (liste de ses clients, ou client déjà
 * choisi depuis l'onglet « Clients ») ; 2) le dossier ; 3) le document. Personnel seulement.
 */
export default async function AskRequestPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/requests/ask">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff(locale);
  const sp = await searchParams;
  const [t, clients] = await Promise.all([getTranslations("admin.requests"), listRequestClients()]);
  const wanted = z.uuid().safeParse(sp.client);
  const client = wanted.success ? clients.find((c) => c.id === wanted.data) : undefined;
  const notice = NOTICES.find((n) => n === sp.notice);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link
          href="/admin/requests"
          className="inline-flex min-h-6 items-center text-gold-ink hover:underline"
        >
          ← {t("backToClients")}
        </Link>
      </p>
      <PageHeader title={t("ask")} subtitle={t("askSubtitle")} />
      <Notice message={notice ? t(`notices.ask_${notice}`) : undefined} error />

      {!client ? (
        <SectionCard title={t("askStep1")}>
          {clients.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("clients.none")}</p>
          ) : (
            <form
              method="get"
              action={`/${locale}/admin/requests/ask`}
              className="flex flex-wrap items-end gap-2"
            >
              <div className="min-w-64 flex-1 space-y-1">
                <label htmlFor="a-client" className={labelClass}>
                  {t("askClient")}
                </label>
                <select id="a-client" name="client" required defaultValue="" className={`${fieldClass} h-11`}>
                  <option value="" disabled>
                    {t("askClientPlaceholder")}
                  </option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.email}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" variant="primary" size="sm" className="h-11">
                {t("askContinue")}
              </Button>
            </form>
          )}
        </SectionCard>
      ) : (
        <form action={createClientRequestAction} className="space-y-6">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="clientId" value={client.id} />
          <SectionCard title={t("askStep1")}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-marine">{client.name}</p>
                <p className="text-sm break-all text-ink-muted">{client.email}</p>
              </div>
              <Link href="/admin/requests/ask" className="text-sm text-gold-ink hover:underline">
                {t("askChangeClient")}
              </Link>
            </div>
          </SectionCard>
          <SectionCard title={t("askStep2")}>
            <fieldset className="space-y-2">
              <legend className="sr-only">{t("askStep2")}</legend>
              {client.matters.map((m, i) => (
                <label key={m.id} className="flex min-h-9 items-center gap-2 text-sm text-marine">
                  <input
                    type="radio"
                    name="matterId"
                    value={m.id}
                    required
                    defaultChecked={client.matters.length === 1 || i === 0}
                    className="size-4 accent-marine"
                  />
                  <span className="font-medium">{[m.number, m.title].filter(Boolean).join(" — ")}</span>
                </label>
              ))}
            </fieldset>
          </SectionCard>
          <SectionCard title={t("step3")}>
            <div className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="a-title" className={labelClass}>
                  {t("requestTitle")}
                </label>
                <input
                  id="a-title"
                  name="title"
                  required
                  maxLength={200}
                  placeholder={t("requestTitlePlaceholder")}
                  className={`${fieldClass} h-11`}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="a-description" className={labelClass}>
                  {t("requestDescription")}
                </label>
                <textarea
                  id="a-description"
                  name="description"
                  rows={3}
                  maxLength={1000}
                  className={`${fieldClass} py-2`}
                />
              </div>
              <div className="max-w-xs space-y-1">
                <label htmlFor="a-due" className={labelClass}>
                  {t("requestDue")}
                </label>
                <input id="a-due" name="dueDate" type="date" className={`${fieldClass} h-11`} />
              </div>
              <InfoNote>{t("askHelp")}</InfoNote>
            </div>
          </SectionCard>
          <Button type="submit" variant="primary" size="brand">
            {t("askSubmit")}
          </Button>
        </form>
      )}
    </>
  );
}
