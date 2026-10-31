"use client";

import { useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CirclePlus, MessageSquare, Route, Search, ShieldCheck, UserRound } from "lucide-react";

import { useSession } from "@/features/auth/useSession";
import { fetchConversations } from "@/lib/api";
import { loginHref } from "@/lib/safe-redirect";

type Tab = {
  key: string;
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean; strokeWidth?: number }>;
  badge?: number;
};

export function BottomTabBar() {
  const pathname = usePathname();
  const session = useSession();
  const accountHref = session.status === "authenticated" ? "/account" : loginHref("/account");
  const messagesHref = session.status === "authenticated" ? "/messages" : loginHref("/messages");
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (session.status !== "authenticated") return;
    let cancelled = false;
    fetchConversations()
      .then((items) => {
        if (!cancelled) {
          setUnread(items.reduce((sum, item) => sum + item.unread_count, 0));
        }
      })
      .catch(() => {
        if (!cancelled) setUnread(0);
      });
    return () => {
      cancelled = true;
    };
  }, [session.status, pathname]);

  const isAdmin = session.status === "authenticated" && session.user.role === "admin";

  // The header collapses to the logo below 768px, so an administrator needs
  // the admin entry in the tab bar too: otherwise /admin is unreachable on a
  // phone.
  const tabs: Tab[] = isAdmin
    ? [
        { key: "/search", href: "/search", label: "Rechercher", Icon: Search },
        { key: "/trips", href: "/trips", label: "Trajets", Icon: Route },
        { key: "/offer", href: "/offer", label: "Proposer", Icon: CirclePlus },
        {
          key: "/messages",
          href: messagesHref,
          label: "Messages",
          Icon: MessageSquare,
          badge: session.status === "authenticated" ? unread : 0,
        },
        { key: "/admin", href: "/admin", label: "Admin", Icon: ShieldCheck },
      ]
    : [
        { key: "/search", href: "/search", label: "Rechercher", Icon: Search },
        { key: "/trips", href: "/trips", label: "Trajets", Icon: Route },
        { key: "/offer", href: "/offer", label: "Proposer", Icon: CirclePlus },
        {
          key: "/messages",
          href: messagesHref,
          label: "Messages",
          Icon: MessageSquare,
          badge: session.status === "authenticated" ? unread : 0,
        },
        { key: "/account", href: accountHref, label: "Compte", Icon: UserRound },
      ];

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-page-border bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid h-16 grid-cols-5">
        {tabs.map(({ key, href, label, Icon, badge = 0 }) => {
          const active = pathname === key || pathname.startsWith(key + "/");
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={
                  "relative flex h-16 min-h-12 flex-col items-center justify-center gap-0.5 px-1 text-center text-[11px] font-medium leading-tight " +
                  (active ? "text-primary-strong" : "text-page-muted hover:text-page-text")
                }
              >
                <span className="relative">
                  <Icon className="h-6 w-6" aria-hidden={true} strokeWidth={active ? 2.4 : 2} />
                  {badge > 0 && (
                    <span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">
                      {badge > 9 ? "9+" : badge}
                      <span className="sr-only"> messages non lus</span>
                    </span>
                  )}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
