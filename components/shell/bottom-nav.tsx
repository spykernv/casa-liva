"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, House, Sparkles, Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";

/* Navigation principale — §10.
   Cinq onglets, jamais plus. Toujours libellés : une icône seule est
   interdite pour une action de navigation critique (§49). */
const TABS = [
  { href: "/aujourdhui", label: "Aujourd’hui", Icon: House },
  { href: "/semaine", label: "Semaine", Icon: CalendarDays },
  { href: "/casa", label: "Casa", Icon: Sparkles },
  { href: "/ia", label: "IA", Icon: Bot },
  { href: "/moi", label: "Moi", Icon: User },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigation principale"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg-elevated/92 backdrop-blur-xl safe-b",
        // Sur grand écran la barre devient un rail latéral (§55, mobile
        // d'abord puis tablette puis desktop).
        "md:inset-y-0 md:right-auto md:w-56 md:border-t-0 md:border-r md:pt-6 md:backdrop-blur-none",
      )}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-1 md:max-w-none md:flex-col md:gap-1 md:px-3">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1 md:flex-none">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-casa px-1 py-1.5",
                  "transition-colors md:min-h-12 md:flex-row md:justify-start md:gap-3 md:px-3",
                  active
                    ? "text-accent md:bg-accent-soft"
                    : "text-ink-3 hover:text-ink-2 md:hover:bg-surface-2",
                )}
              >
                <Icon
                  size={23}
                  strokeWidth={active ? 2.4 : 1.9}
                  aria-hidden="true"
                  className="shrink-0"
                />
                <span
                  className={cn(
                    "text-[0.6875rem] leading-tight md:text-base",
                    active ? "font-bold" : "font-medium",
                  )}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
