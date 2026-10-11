"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/inbox", label: "Inbox" },
  { href: "/contacts", label: "Contacts" },
  { href: "/segments", label: "Segments" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/analytics", label: "Analytics" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <header className="flex h-12 shrink-0 items-center gap-6 border-b border-slate-200 bg-white px-4">
      <span className="shrink-0 font-semibold">ChatCMS Adv</span>
      <nav className="-mb-px flex h-full min-w-0 gap-1 overflow-x-auto">
        {LINKS.map((l) => {
          const active = pathname === l.href || pathname.startsWith(l.href + "/");
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center border-b-2 px-2 text-sm whitespace-nowrap ${
                active ? "border-slate-900 font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
