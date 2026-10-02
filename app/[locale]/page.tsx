import { redirect } from "next/navigation";
import { defaultPortalPath } from "@/lib/safe-redirect";

// L'accueil mène au portail ; proxy.ts et le layout renvoient vers la connexion si besoin.
export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  redirect(defaultPortalPath(locale));
}
