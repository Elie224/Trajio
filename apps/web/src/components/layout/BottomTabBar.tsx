"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CirclePlus, Route, Search, UserRound } from "lucide-react";

import { useSession } from "@/features/auth/useSession";
import { loginHref } from "@/lib/safe-redirect";

/** Mobile navigation (< 768px): 64px + safe area, 4 tabs, icon + label. */
export function BottomTabBar() {
  const pathname = usePathname();
  const session = useSession();
  const accountHref = session.status === "authenticated" ? "/account" : loginHref("/account");

  const tabs = [
    { key: "/search", href: "/search", label: "Rechercher", Icon: Search },
    { key: "/trips", href: "/trips", label: "Mes trajets", Icon: Route },
    { key: "/offer", href: "/offer", label: "Proposer", Icon: CirclePlus },
    { key: "/account", href: accountHref, label: "Compte", Icon: UserRound },
  ] as const;

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-page-border bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid h-16 grid-cols-4">
        {tabs.map(({ key, href, label, Icon }) => {
          const active = pathname === key || pathname.startsWith(key + "/");
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={
                  "flex h-16 flex-col items-center justify-center gap-1 text-sm font-medium " +
                  (active ? "text-primary-strong" : "text-page-muted hover:text-page-text")
                }
              >
                <Icon className="h-6 w-6" aria-hidden="true" strokeWidth={active ? 2.4 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
