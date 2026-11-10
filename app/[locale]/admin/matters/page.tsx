import { AlertTriangle, FolderOpen, X } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MatterStatusBadge } from "@/components/portal/matter-parts";
import { Notice } from "@/components/admin/notice";
import { EmptyState, InfoNote, PageHeader, ProgressBar, SectionCard } from "@/components/portal/ui";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { TagChip } from "@/components/shared/tag-chip";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatRelative } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { removeViewAction, saveViewAction } from "@/server/actions/views";
import {
  canonicalViewQuery,
  getMatterBoard,
  listSavedViews,
  viewModeSchema,
} from "@/server/services/matter-board";
import { listPortfolio, listTags, matterFiltersSchema } from "@/server/services/matter-tags";
import { listMatterTypes, pick } from "@/server/services/matter-templates";
import { listOffices } from "@/server/services/offices";

const fieldClass =
  "h-10 w-full rounded-[2px] border border-gray-200 bg-white px-3 text-sm text-marine focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none";
const labelClass = "text-[13px] font-medium text-marine";
const STATUSES = ["open", "action_required", "on_hold", "closed"] as const;
const NOTICES = [
  "viewSaved",
  "viewRemoved",
  "viewDuplicate",
  "viewLimit",
  "viewInvalid",
  "viewFailed",
  "viewRemoveFailed",
] as const;

/**
 * Portefeuille des dossiers (ADR 0021, 0023) : filtres combinés, étiquettes, alertes, vues enregistrées,
 * affichage en liste ou en tableau (Kanban par étape d'un type). RLS : dossiers de ses équipes.
 */
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
    office: sp.office || undefined,
    status: sp.status || undefined,
    alert: sp.alert || undefined,
  });
  const mode = viewModeSchema.parse(sp.view);
  const supabase = await createSupabaseServerClient();
  const [t, portfolio, board, views, tags, types, offices, { data: staff }] = await Promise.all([
    getTranslations("admin.matters"),
    mode === "list" ? listPortfolio(filters) : Promise.resolve({ rows: [], truncated: false }),
    mode === "board" && filters.type ? getMatterBoard(filters.type, filters) : Promise.resolve(null),
    listSavedViews(),
    listTags(),
    listMatterTypes(),
    listOffices(),
    supabase
      .from("profiles")
      .select("id, first_name, last_name, email")
      .in("role", ["staff", "firm_admin"])
      .eq("status", "active")
      .order("last_name"),
  ]);
  const { rows, truncated } = portfolio;
  const shown =
    mode === "board" ? (board?.columns.reduce((n, c) => n + c.cards.length, 0) ?? 0) : rows.length;
  const currentQuery = canonicalViewQuery({ ...filters, view: mode });
  const modeHref = (m: "list" | "board") =>
    `/admin/matters${(() => {
      const q = canonicalViewQuery({ ...filters, view: m });
      return q ? `?${q}` : "";
    })()}`;
  const notice = NOTICES.find((n) => n === sp.notice);
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
            {rows.some((m) => m.is_mock) || board?.columns.some((c) => c.cards.some((m) => m.is_mock)) ? (
              <DemoDataBadge />
            ) : null}
            {role === "firm_admin" ? (
              <Button asChild variant="primary" size="sm">
                <Link href="/admin/matters/new">{t("openNew")}</Link>
              </Button>
            ) : null}
          </>
        }
      />

      <Notice
        message={notice ? t(`notices.${notice}`) : undefined}
        error={notice !== undefined && notice !== "viewSaved" && notice !== "viewRemoved"}
      />

      <nav aria-label={t("mode.label")} className="mb-4 flex gap-2">
        {(["list", "board"] as const).map((m) => (
          <Button key={m} asChild variant={mode === m ? "primary" : "outline-gold"} size="sm">
            <Link href={modeHref(m)} aria-current={mode === m ? "page" : undefined}>
              {t(`mode.${m}`)}
            </Link>
          </Button>
        ))}
      </nav>

      <SectionCard className="mb-6">
        {/* key : les listes de choix se remettent à jour quand on ouvre une vue enregistrée. */}
        <form
          key={currentQuery}
          method="get"
          action={`/${locale}/admin/matters`}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {mode === "board" ? <input type="hidden" name="view" value="board" /> : null}
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
            <label htmlFor="f-office" className={labelClass}>
              {t("filters.office")}
            </label>
            <select id="f-office" name="office" defaultValue={filters.office ?? ""} className={fieldClass}>
              <option value="">{t("filters.all")}</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {pick(locale, o.name_fr, o.name_en)}
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
                <Link href={mode === "board" ? "/admin/matters?view=board" : "/admin/matters"}>
                  {t("filters.reset")}
                </Link>
              </Button>
            ) : null}
            <span className="text-sm text-ink-muted" role="status">
              {t("filters.count", { count: shown })}
              {truncated || board?.truncated ? ` — ${t("filters.truncated", { limit: 300 })}` : ""}
            </span>
          </div>
        </form>
      </SectionCard>

      <SectionCard title={t("views.title")} className="mb-6">
        {views.length ? (
          <ul className="mb-4 flex flex-wrap gap-2">
            {views.map((v) => (
              <li
                key={v.id}
                className={`inline-flex items-center rounded-full border text-sm ${
                  v.query === currentQuery
                    ? "border-marine bg-marine text-white"
                    : "border-gold/40 bg-cream text-marine"
                }`}
              >
                <Link
                  href={`/admin/matters${v.query ? `?${v.query}` : ""}`}
                  aria-current={v.query === currentQuery ? "page" : undefined}
                  className="inline-flex min-h-9 items-center py-1 pr-1 pl-3 hover:underline"
                >
                  {v.name}
                </Link>
                <form action={removeViewAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="id" value={v.id} />
                  <button
                    type="submit"
                    aria-label={t("views.remove", { name: v.name })}
                    className="inline-flex size-9 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-ink-muted">{t("views.none")}</p>
        )}
        <form action={saveViewAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="locale" value={locale} />
          {[...new URLSearchParams(currentQuery)].map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <div className="min-w-0 flex-1 basis-56 space-y-1">
            <label htmlFor="v-name" className={labelClass}>
              {t("views.name")}
            </label>
            <input id="v-name" name="name" required maxLength={80} className={fieldClass} />
          </div>
          <Button type="submit" variant="outline-gold" size="sm" className="h-10">
            {t("views.save")}
          </Button>
        </form>
      </SectionCard>

      {mode === "board" ? (
        !filters.type ? (
          <InfoNote>{t("board.chooseType")}</InfoNote>
        ) : !board ? (
          <EmptyState icon={FolderOpen} message={t("filters.none")} />
        ) : (
          <div
            role="region"
            aria-label={t("board.label")}
            tabIndex={0}
            className="grid gap-4 focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none sm:flex sm:overflow-x-auto sm:pb-3"
          >
            {board.columns.map((col) => {
              const heading =
                col.kind === "step" ? pick(locale, col.title_fr ?? "", col.title_en) : t(`board.${col.kind}`);
              return (
                <section
                  key={col.key}
                  aria-label={heading}
                  className={`${col.cards.length ? "flex" : "hidden sm:flex"} flex-col rounded-[2px] border border-gray-200 bg-cream/60 p-3 sm:w-72 sm:shrink-0`}
                >
                  <h2 className="mb-3 flex items-baseline justify-between gap-2 text-sm font-semibold text-marine">
                    <span>{heading}</span>
                    <span className="text-xs font-semibold text-ink-muted">{col.cards.length}</span>
                  </h2>
                  {col.cards.length === 0 ? (
                    <p className="text-xs text-ink-muted">{t("board.empty")}</p>
                  ) : (
                    <ul className="space-y-2">
                      {col.cards.map((m) => (
                        <li
                          key={m.id}
                          className="rounded-[2px] border border-gray-200 bg-white p-3 shadow-sm"
                        >
                          <Link
                            href={`/admin/matters/${m.id}`}
                            className="block text-sm font-medium text-marine hover:underline"
                          >
                            {m.title}
                          </Link>
                          <p className="mt-0.5 text-xs text-ink-muted">
                            {[m.display_number, m.responsible_name].filter(Boolean).join(" · ")}
                          </p>
                          {col.kind === "other" && m.currentStep ? (
                            <p className="mt-1 text-xs text-marine">
                              {pick(locale, m.currentStep, m.currentStepEn)}
                            </p>
                          ) : null}
                          {m.tagIds.length ? (
                            <p className="mt-2 flex flex-wrap gap-1">
                              {m.tagIds.map((id) => {
                                const tg = tagById.get(id);
                                return tg ? (
                                  <TagChip
                                    key={id}
                                    label={pick(locale, tg.name_fr, tg.name_en)}
                                    color={tg.color}
                                  />
                                ) : null;
                              })}
                            </p>
                          ) : null}
                          {m.overdueRequests ? (
                            <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-destructive">
                              <AlertTriangle aria-hidden className="size-3.5" />
                              {t("overdueCount", { count: m.overdueRequests })}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )
      ) : (
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
                              <TagChip
                                key={id}
                                label={pick(locale, tg.name_fr, tg.name_en)}
                                color={tg.color}
                              />
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
      )}
    </>
  );
}
