import {
  Bell,
  CalendarDays,
  CreditCard,
  FileText,
  FolderOpen,
  LayoutDashboard,
  MessageSquare,
  UserRound,
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
