import {
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  CreditCard,
  FileQuestion,
  FileSignature,
  FileText,
  FolderOpen,
  Gavel,
  LayoutDashboard,
  LayoutTemplate,
  MailPlus,
  MessageSquare,
  PlugZap,
  ScrollText,
  ShieldAlert,
  Sun,
  UserCog,
  UserRound,
  Users,
} from "lucide-react";

/** Navigation du portail (ordre de la maquette, docs/design-system.md §5.3). */
export const PORTAL_NAV = [
  { key: "overview", href: "/portal", icon: LayoutDashboard, exact: true },
  { key: "matters", href: "/portal/matters", icon: FolderOpen },
  { key: "documents", href: "/portal/documents", icon: FileText },
  { key: "messages", href: "/portal/messages", icon: MessageSquare },
  { key: "billing", href: "/portal/billing", icon: CreditCard },
  { key: "appointments", href: "/portal/appointments", icon: CalendarDays },
  { key: "notifications", href: "/portal/notifications", icon: Bell },
  { key: "profile", href: "/portal/profile", icon: UserRound },
] as const;

export type PortalNavKey = (typeof PORTAL_NAV)[number]["key"];

/** Sous-menu d'une entrée (menu déroulant au survol ou au clavier). `primary` : bouton d'action. */
export type NavChild = { key: string; href: string; primary?: boolean; adminOnly?: boolean };

/**
 * Navigation de l'espace cabinet, en trois groupes (décision UX du 2026-10-18) : « Mon travail »,
 * « Clients », « Administration » (une seule entrée, son contenu en menu déroulant).
 * `adminOnly` : réservé au firm_admin (revérifié par chaque page).
 */
export const ADMIN_NAV_GROUPS = [
  {
    key: "groupWork",
    items: [
      { key: "overview", href: "/admin", icon: Sun, exact: true },
      {
        key: "matters",
        href: "/admin/matters",
        icon: FolderOpen,
        children: [
          { key: "allMatters", href: "/admin/matters" },
          { key: "requests", href: "/admin/requests" },
          { key: "newMatter", href: "/admin/matters/new", primary: true, adminOnly: true },
        ],
      },
      { key: "messages", href: "/admin/messages", icon: MessageSquare },
      {
        key: "calendar",
        href: "/admin/court-calendar",
        icon: Gavel,
        children: [
          { key: "courtCalendar", href: "/admin/court-calendar" },
          { key: "toConfirm", href: "/admin/court-calendar?view=list&status=to_confirm" },
          { key: "myCalendar", href: "/admin/my-calendar" },
        ],
      },
      {
        key: "contracts",
        href: "/admin/contracts",
        icon: FileSignature,
        children: [
          { key: "allContracts", href: "/admin/contracts" },
          { key: "contractsInReview", href: "/admin/contracts?status=in_review" },
          { key: "myContracts", href: "/admin/contracts?mine=1" },
          { key: "contractTemplates", href: "/admin/contracts/templates" },
          { key: "contractClauses", href: "/admin/contracts/clauses", adminOnly: true },
          { key: "contractServices", href: "/admin/contracts/services", adminOnly: true },
          { key: "newContract", href: "/admin/contracts/new", primary: true },
        ],
      },
      { key: "requests", href: "/admin/requests", icon: FileQuestion },
    ],
  },
  {
    key: "groupClients",
    adminOnly: true,
    items: [
      { key: "clients", href: "/admin/clients", icon: Users },
      { key: "invitations", href: "/admin/invitations", icon: MailPlus },
    ],
  },
  {
    key: "groupAdmin",
    adminOnly: true,
    collapsed: true,
    items: [
      { key: "templates", href: "/admin/templates", icon: LayoutTemplate },
      { key: "offices", href: "/admin/offices", icon: Building2 },
      { key: "workload", href: "/admin/workload", icon: BarChart3 },
      { key: "staff", href: "/admin/staff", icon: UserCog },
      { key: "integrations", href: "/admin/integrations", icon: PlugZap },
      { key: "audit", href: "/admin/audit", icon: ScrollText },
      { key: "security", href: "/admin/security/mfa-reset", icon: ShieldAlert },
    ],
  },
] as const;

export type AdminNavGroup = (typeof ADMIN_NAV_GROUPS)[number];
