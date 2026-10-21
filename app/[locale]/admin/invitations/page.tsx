import { MailPlus } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { InvitationForm } from "@/components/admin/invitation-form";
import { Notice } from "@/components/admin/notice";
import { EmptyState, PageHeader, SectionCard } from "@/components/portal/ui";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import {
  createInvitationAction,
  resendInvitationAction,
  revokeInvitationAction,
} from "@/server/actions/admin";
import { requireStaff } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";
import { listInvitations } from "@/server/services/admin";
import { z } from "zod";
import { getContract } from "@/server/services/contracts";

const TONE: Record<string, StatusTone> = {
  pending: "pending",
  accepted: "completed",
  revoked: "urgent",
  expired: "urgent",
};

export default async function InvitationsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/invitations">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff(locale, ["firm_admin"]);
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  // « Inviter ce client » depuis un contrat (ADR 0036) : la fiche est relue ici (accès revérifié).
  const fromContract = z.uuid().safeParse(sp.fromContract);
  const source = fromContract.success ? await getContract(fromContract.data) : null;
  const [firstName, ...rest] = (source?.contract.clientName ?? "").trim().split(/\s+/);
  const defaults =
    source && source.contract.clientEmail && !source.contract.clientId
      ? {
          email: source.contract.clientEmail,
          firstName: firstName ?? "",
          lastName: rest.join(" "),
          language: source.contract.clientLanguage,
          matterId: source.contract.matter?.id ?? null,
        }
      : undefined;
  const [{ data: matters }, invitations, t] = await Promise.all([
    supabase
      .from("matters")
      .select("id, display_number, title")
      .neq("status", "closed")
      .order("display_number"),
    listInvitations(),
    getTranslations("admin"),
  ]);
  const notice =
    sp.notice === "resent"
      ? t("invitationsList.resent")
      : sp.notice === "revoked"
        ? t("invitationsList.revoked")
        : sp.notice === "failed"
          ? t("errors.FAILED")
          : undefined;

  return (
    <>
      <PageHeader title={t("invitationsList.title")} subtitle={t("invitationsList.subtitle")} />
      <Notice message={notice} error={sp.notice === "failed"} />
      <div className="grid gap-6 lg:grid-cols-5">
        <SectionCard title={t("invitations.title")} className="lg:col-span-2">
          <InvitationForm
            action={createInvitationAction}
            locale={locale}
            matters={matters ?? []}
            defaults={defaults}
          />
        </SectionCard>
        <SectionCard title={t("invitationsList.list")} className="lg:col-span-3">
          {invitations.length === 0 ? (
            <EmptyState icon={MailPlus} message={t("invitationsList.none")} />
          ) : (
            <ul className="divide-y divide-gray-100">
              {invitations.map((inv) => {
                const status = inv.displayStatus;
                const matterNumbers = (inv.client_invitation_matters ?? [])
                  .map(
                    (m) => (m.matters as unknown as { display_number: string | null } | null)?.display_number,
                  )
                  .filter(Boolean)
                  .join(", ");
                return (
                  <li key={inv.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-marine">{inv.email}</p>
                      <p className="text-xs text-ink-muted">
                        {[
                          matterNumbers,
                          inv.status === "pending"
                            ? t("invitationsList.expires", { date: formatDate(inv.expires_at, locale) })
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <StatusBadge
                      tone={TONE[status] ?? "pending"}
                      label={t(`invitationsList.statusLabels.${status}`)}
                    />
                    {inv.status === "pending" ? (
                      <div className="flex gap-2">
                        <form action={resendInvitationAction}>
                          <input type="hidden" name="id" value={inv.id} />
                          <input type="hidden" name="locale" value={locale} />
                          <Button type="submit" variant="outline-gold" size="sm">
                            {t("invitationsList.resend")}
                          </Button>
                        </form>
                        <form action={revokeInvitationAction}>
                          <input type="hidden" name="id" value={inv.id} />
                          <input type="hidden" name="locale" value={locale} />
                          <Button type="submit" variant="ghost" size="sm">
                            {t("invitationsList.revoke")}
                          </Button>
                        </form>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
