import { AlertTriangle, FolderOpen } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MatterStatusBadge } from "@/components/portal/matter-parts";
import { EmptyState, PageHeader, ProgressBar, SectionCard } from "@/components/portal/ui";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { TagChip } from "@/components/shared/tag-chip";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatRelative } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { listPortfolio, listTags, matterFiltersSchema } from "@/server/services/matter-tags";
import { listMatterTypes, pick } from "@/server/services/matter-templates";

const fieldClass =
  "h-10 w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";
const labelClass = "text-xs font-semibold tracking-[0.05em] text-marine uppercase";
const STATUSES = ["open", "action_required", "on_hold", "closed"] as const;

/** Portefeuille des dossiers (ADR 0021) : filtres combinés, étiquettes, alertes. RLS : dossiers de ses équipes. */
export default async function AdminMattersPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/matters">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { role } = await requireStaff(locale);
  const sp = await searchParams;
  const filters = matterFiltersSchema.parse({
    q: sp.q || undefined,
    tag: sp.tag || undefined,
    type: sp.type || undefined,
    lawyer: sp.lawyer || undefined,
    status: sp.status || undefined,
    alert: sp.alert || undefined,
  });
  const supabase = await createSupabaseServerClient();
  const [t, portfolio, tags, types, { data: staff }] = await Promise.all([
    getTranslations("admin.matters"),
    listPortfolio(filters),
    listTags(),
    listMatterTypes(),
    supabase
      .from("profiles")
      .select("id, first_name, last_name, email")
      .in("role", ["staff", "firm_admin"])
      .eq("status", "active")
      .order("last_name"),
  ]);
  const { rows, truncated } = portfolio;
  // Mêmes libellés que la pastille de statut des dossiers.
  const tStatus = await getTranslations("portal.matterStatus");
  const tagById = new Map(tags.map((tg) => [tg.id, tg]));
  const typeById = new Map(types.map((ty) => [ty.id, ty]));
  const filtered = Object.values(filters).some(Boolean);
  const person = (p: { first_name: string | null; last_name: string | null; email: string }) =>
    [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email;

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            {rows.some((m) => m.is_mock) ? <DemoDataBadge /> : null}
            {role === "firm_admin" ? (
              <Button asChild variant="primary" size="sm">
                <Link href="/admin/matters/new">{t("openNew")}</Link>
              </Button>
            ) : null}
          </>
        }
      />

      <SectionCard className="mb-6">
        <form
          method="get"
          action={`/${locale}/admin/matters`}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <div className="space-y-1">
            <label htmlFor="f-q" className={labelClass}>
              {t("filters.q")}
            </label>
            <input id="f-q" name="q" defaultValue={filters.q ?? ""} maxLength={100} className={fieldClass} />
          </div>
          <div className="space-y-1">
            <label htmlFor="f-tag" className={labelClass}>
              {t("filters.tag")}
            </label>
            <select id="f-tag" name="tag" defaultValue={filters.tag ?? ""} className={fieldClass}>
              <option value="">{t("filters.all")}</option>
              {tags.map((tg) => (
                <option key={tg.id} value={tg.id}>
                  {pick(locale, tg.name_fr, tg.name_en)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="f-type" className={labelClass}>
              {t("filters.type")}
            </label>
            <select id="f-type" name="type" defaultValue={filters.type ?? ""} className={fieldClass}>
              <option value="">{t("filters.all")}</option>
              {types.map((ty) => (
                <option key={ty.id} value={ty.id}>
                  {pick(locale, ty.name_fr, ty.name_en)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="f-lawyer" className={labelClass}>
              {t("filters.lawyer")}
            </label>
            <select id="f-lawyer" name="lawyer" defaultValue={filters.lawyer ?? ""} className={fieldClass}>
              <option value="">{t("filters.all")}</option>
              {(staff ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {person(p)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="f-status" className={labelClass}>
              {t("filters.status")}
            </label>
            <select id="f-status" name="status" defaultValue={filters.status ?? ""} className={fieldClass}>
              <option value="">{t("filters.all")}</option>
              {STATUSES.map((st) => (
                <option key={st} value={st}>
                  {tStatus(st)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="f-alert" className={labelClass}>
              {t("filters.alert")}
            </label>
            <select id="f-alert" name="alert" defaultValue={filters.alert ?? ""} className={fieldClass}>
              <option value="">{t("filters.all")}</option>
              <option value="overdue">{t("filters.overdue")}</option>
              <option value="idle">{t("filters.idle")}</option>
            </select>
          </div>
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3">
            <Button type="submit" variant="primary" size="sm">
              {t("filters.apply")}
            </Button>
            {filtered ? (
              <Button asChild variant="outline-gold" size="sm">
                <Link href="/admin/matters">{t("filters.reset")}</Link>
              </Button>
            ) : null}
            <span className="text-sm text-ink-muted" role="status">
              {t("filters.count", { count: rows.length })}
              {truncated ? ` — ${t("filters.truncated", { limit: 300 })}` : ""}
            </span>
          </div>
        </form>
      </SectionCard>

      <SectionCard>
        {rows.length === 0 ? (
          <EmptyState icon={FolderOpen} message={filtered ? t("filters.none") : t("none")} />
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((m) => {
              const type = m.matter_type_id ? typeById.get(m.matter_type_id) : undefined;
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 py-4">
                  <div className="min-w-0 flex-1 basis-72 space-y-1.5">
                    <p className="font-medium text-marine">{m.title}</p>
                    <p className="text-xs text-ink-muted">
                      {[
                        m.display_number,
                        type ? pick(locale, type.name_fr, type.name_en) : null,
                        m.responsible_name,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {m.tagIds.length ? (
                      <p className="flex flex-wrap gap-1.5">
                        {m.tagIds.map((id) => {
                          const tg = tagById.get(id);
                          return tg ? (
                            <TagChip key={id} label={pick(locale, tg.name_fr, tg.name_en)} color={tg.color} />
                          ) : null;
                        })}
                      </p>
                    ) : null}
                    {m.progress_percent !== null ? (
                      <div className="max-w-xs">
                        <ProgressBar value={m.progress_percent} label={t("progress")} />
                      </div>
                    ) : null}
                  </div>
                  <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                    {m.overdueRequests ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive">
                        <AlertTriangle aria-hidden className="size-3.5" />
                        {t("overdueCount", { count: m.overdueRequests })}
                      </span>
                    ) : m.pendingRequests ? (
                      <span className="text-xs text-ink-muted">
                        {t("pendingCount", { count: m.pendingRequests })}
                      </span>
                    ) : null}
                    <span className="text-xs text-ink-muted">
                      {m.lastActivity
                        ? t("lastActivity", { when: formatRelative(m.lastActivity, locale) })
                        : ""}
                    </span>
                    <MatterStatusBadge status={m.status} />
                    <Button asChild variant="outline-gold" size="sm">
                      <Link href={`/admin/matters/${m.id}`}>{t("open")}</Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
