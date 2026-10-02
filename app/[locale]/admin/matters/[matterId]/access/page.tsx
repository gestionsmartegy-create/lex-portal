import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { GrantAccessForm } from "@/components/admin/grant-access-form";
import { Notice } from "@/components/admin/notice";
import { MatterStatusBadge } from "@/components/portal/matter-parts";
import { PageHeader, SectionCard } from "@/components/portal/ui";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import { grantMatterAccessAction, revokeMatterAccessAction } from "@/server/actions/admin";
import { requireStaff } from "@/server/auth/session";
import { getMatterAccessDetail } from "@/server/services/admin";

type Person = { first_name: string | null; last_name: string | null; email: string } | null;
const personName = (p: Person) =>
  p ? [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email : "—";

export default async function MatterAccessPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/matters/[matterId]/access">) {
  const { locale, matterId } = await params;
  setRequestLocale(locale);
  await requireStaff(locale, ["firm_admin"]);
  const sp = await searchParams;
  const detail = await getMatterAccessDetail(matterId);
  if (!detail) notFound();
  const t = await getTranslations("admin.matters");
  const { matter, team, access } = detail;
  const active = access.filter((a) => !a.revoked_at);
  const revoked = access.filter((a) => a.revoked_at);
  const notice =
    sp.notice === "revoked" ? t("revoked") : sp.notice === "failed" ? t("errors.FAILED") : undefined;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link
          href="/admin/matters"
          className="inline-flex min-h-6 items-center text-gold-ink hover:underline"
        >
          ← {t("back")}
        </Link>
      </p>
      <PageHeader
        title={matter.title}
        subtitle={[matter.display_number, matter.practice_area].filter(Boolean).join(" · ")}
        actions={
          <>
            <MatterStatusBadge status={matter.status} />
            {matter.is_mock ? <DemoDataBadge /> : null}
          </>
        }
      />
      <Notice message={notice} error={sp.notice === "failed"} />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <SectionCard title={t("clientAccess")}>
            {active.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("noAccess")}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {active.map((a) => (
                  <li key={a.id} className="space-y-3 py-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-marine">
                          {personName(a.profiles as unknown as Person)}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {t("grantedOn", { date: formatDate(a.granted_at, locale) })}
                        </p>
                      </div>
                      <StatusBadge
                        tone="active"
                        label={a.access_level === "read_write" ? t("levelWrite") : t("levelRead")}
                      />
                    </div>
                    <form action={revokeMatterAccessAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="matterId" value={matter.id} />
                      <input type="hidden" name="locale" value={locale} />
                      <div className="min-w-48 flex-1 space-y-1">
                        <label htmlFor={`reason-${a.id}`} className="text-xs text-ink-muted">
                          {t("revokeReason")}
                        </label>
                        <input
                          id={`reason-${a.id}`}
                          name="reason"
                          required
                          maxLength={500}
                          className="h-9 w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine"
                        />
                      </div>
                      <Button type="submit" variant="outline-gold" size="sm" className="h-9">
                        {t("revoke")}
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            {revoked.length > 0 ? (
              <ul className="mt-4 space-y-1 border-t border-gray-100 pt-4 text-xs text-ink-muted">
                {revoked.map((a) => (
                  <li key={a.id}>
                    {personName(a.profiles as unknown as Person)} —{" "}
                    {t("revokedOn", { date: formatDate(a.revoked_at!, locale) })}
                  </li>
                ))}
              </ul>
            ) : null}
          </SectionCard>
          <SectionCard title={t("team")}>
            <ul className="space-y-2 text-sm">
              {team.map((m) => (
                <li key={m.user_id} className="flex justify-between gap-3">
                  <span className="text-marine">{personName(m.profiles as unknown as Person)}</span>
                  <span className="text-xs text-ink-muted">{m.role}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
        <SectionCard title={t("grant")} className="lg:col-span-2">
          <GrantAccessForm action={grantMatterAccessAction} locale={locale} matterId={matter.id} />
        </SectionCard>
      </div>
    </>
  );
}
