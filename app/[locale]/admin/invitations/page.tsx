import { getTranslations, setRequestLocale } from "next-intl/server";
import { InvitationForm } from "@/components/admin/invitation-form";
import { createInvitationAction } from "@/server/actions/admin";
import { requireStaff } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/server-client";

export default async function InvitationsPage({ params }: PageProps<"/[locale]/admin/invitations">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff(locale, ["firm_admin"]);
  const supabase = await createSupabaseServerClient();
  const { data: matters } = await supabase
    .from("matters")
    .select("id, display_number, title")
    .neq("status", "closed")
    .order("display_number");
  const t = await getTranslations("admin.invitations");

  return (
    <main id="main" className="mx-auto min-h-screen max-w-xl bg-surface p-6 sm:p-10">
      <h1 className="mb-8 text-[28px] font-bold">{t("title")}</h1>
      <InvitationForm action={createInvitationAction} locale={locale} matters={matters ?? []} />
    </main>
  );
}
