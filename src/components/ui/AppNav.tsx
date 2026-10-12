"use client";

import {
  BarChart3,
  Contact,
  FileText,
  IndianRupee,
  Layers,
  type LucideIcon,
  MessagesSquare,
  Send,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/inbox", label: "Live Chat", icon: MessagesSquare },
  { href: "/contacts", label: "Contacts", icon: Contact },
  { href: "/segments", label: "Segments", icon: Layers },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/campaigns", label: "Campaigns", icon: Send },
  { href: "/payments", label: "Payments", icon: IndianRupee },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

/** Vertical navigation on the left (a horizontal bar on narrow screens). */
export function AppNav() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <nav
      aria-label="Main"
      className="flex shrink-0 items-center gap-1 overflow-x-auto bg-[#0f3d3e] px-2 text-white md:h-full md:w-[84px] md:flex-col md:overflow-x-visible md:overflow-y-auto md:px-0 md:py-3"
    >
      <Link href="/inbox" className="mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400 font-bold text-[#0f3d3e] md:mr-0 md:mb-3" title="ChatCMS Adv">
        CA
      </Link>
      {LINKS.map((l) => (
        <NavItem key={l.href} {...l} active={isActive(l.href)} />
      ))}
      <div className="hidden md:block md:flex-1" />
      <NavItem href="/settings" label="Settings" icon={Settings} active={isActive("/settings")} />
    </nav>
  );
}

function NavItem({ href, label, icon: Icon, active }: { href: string; label: string; icon: LucideIcon; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group flex shrink-0 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] leading-tight md:w-[76px] md:py-2 ${
        active ? "text-white" : "text-teal-100/80 hover:bg-white/10 hover:text-white"
      }`}
    >
      <span className={`flex h-8 w-8 items-center justify-center rounded-full ${active ? "bg-white text-[#0f3d3e]" : ""}`}>
        <Icon size={18} strokeWidth={2} aria-hidden />
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </Link>
  );
}
