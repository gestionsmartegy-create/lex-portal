import { setRequestLocale } from "next-intl/server";
import { requireStaff } from "@/server/auth/session";

// Garde du personnel pour tout /admin : rôle EFFECTIF (session Microsoft, ou *.test en local).
export default async function AdminLayout({ children, params }: LayoutProps<"/[locale]/admin">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff(locale);
  return children;
}
