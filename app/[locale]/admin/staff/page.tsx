import { getTranslations, setRequestLocale } from "next-intl/server";
import { StaffProvisionForm } from "@/components/admin/staff-form";
import { provisionStaffAction } from "@/server/actions/admin";
import { requireStaff } from "@/server/auth/session";

export default async function StaffPage({ params }: PageProps<"/[locale]/admin/staff">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff(locale, ["firm_admin"]);
  const t = await getTranslations("admin.staff");
  return (
    <div className="max-w-xl">
      <h1 className="mb-8 text-[28px] font-bold">{t("title")}</h1>
      <StaffProvisionForm action={provisionStaffAction} locale={locale} />
    </div>
  );
}
