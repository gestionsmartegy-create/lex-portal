import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppointmentList } from "@/components/portal/lists";
import { PageHeader, SectionCard } from "@/components/portal/ui";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { DEFAULT_TIMEZONE } from "@/lib/format";
import { requireClientSession } from "@/server/auth/session";
import { listAppointments } from "@/server/services/appointment";

export default async function AppointmentsPage({ params }: PageProps<"/[locale]/portal/appointments">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireClientSession(locale, `/${locale}/portal/appointments`);
  const [t, { upcoming, past }] = await Promise.all([
    getTranslations("portal.appointments"),
    listAppointments(),
  ]);
  const isMock = [...upcoming, ...past].some((a) => a.matters?.is_mock);
  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={isMock ? <DemoDataBadge /> : null} />
      <div className="space-y-6">
        <SectionCard title={t("upcoming")}>
          <AppointmentList appointments={upcoming} />
        </SectionCard>
        <SectionCard title={t("past")}>
          <AppointmentList appointments={past} />
        </SectionCard>
        <p className="text-xs text-ink-muted">{t("timezone", { zone: DEFAULT_TIMEZONE })}</p>
      </div>
    </>
  );
}
