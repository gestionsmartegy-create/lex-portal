import { getTranslations } from "next-intl/server";
import { TabLinks } from "@/components/portal/tab-links";

/** Onglets de la section Contrats (ADR 0034) : clauses et services réservés au firm_admin. */
export async function ContractsTabs({
  active,
  isFirmAdmin,
}: {
  active: "contracts" | "templates" | "clauses" | "services";
  isFirmAdmin: boolean;
}) {
  const t = await getTranslations("admin.contracts.tabs");
  const items = [
    { key: "contracts", href: "/admin/contracts" },
    { key: "templates", href: "/admin/contracts/templates" },
    ...(isFirmAdmin
      ? [
          { key: "clauses", href: "/admin/contracts/clauses" },
          { key: "services", href: "/admin/contracts/services" },
        ]
      : []),
  ] as const;
  return (
    <TabLinks
      label={t("label")}
      items={items.map((i) => ({ href: i.href, label: t(i.key), active: i.key === active }))}
    />
  );
}
