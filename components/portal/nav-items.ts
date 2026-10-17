import {
  BarChart3,
  Bell,
  Building2,
  CalendarClock,
  CalendarDays,
  CreditCard,
  FileQuestion,
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

/** Navigation de l'espace cabinet. `adminOnly` : réservé au firm_admin (revérifié par chaque page). */
export const ADMIN_NAV = [
  { key: "overview", href: "/admin", icon: LayoutDashboard, exact: true },
  { key: "clients", href: "/admin/clients", icon: Users, adminOnly: true },
  { key: "invitations", href: "/admin/invitations", icon: MailPlus, adminOnly: true },
  { key: "messages", href: "/admin/messages", icon: MessageSquare },
  { key: "matters", href: "/admin/matters", icon: FolderOpen },
  { key: "requests", href: "/admin/requests", icon: FileQuestion },
  { key: "courtCalendar", href: "/admin/court-calendar", icon: Gavel },
  { key: "myCalendar", href: "/admin/my-calendar", icon: CalendarClock },
  { key: "templates", href: "/admin/templates", icon: LayoutTemplate, adminOnly: true },
  { key: "offices", href: "/admin/offices", icon: Building2, adminOnly: true },
  { key: "workload", href: "/admin/workload", icon: BarChart3, adminOnly: true },
  { key: "audit", href: "/admin/audit", icon: ScrollText, adminOnly: true },
  { key: "integrations", href: "/admin/integrations", icon: PlugZap, adminOnly: true },
  { key: "staff", href: "/admin/staff", icon: UserCog, adminOnly: true },
  { key: "security", href: "/admin/security/mfa-reset", icon: ShieldAlert, adminOnly: true },
] as const;

export type AdminNavKey = (typeof ADMIN_NAV)[number]["key"];
