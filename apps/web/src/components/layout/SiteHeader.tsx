"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CarFront, Menu, X } from "lucide-react";

import { buttonClasses } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { AuthActions } from "@/features/auth/AuthActions";
import { useSession } from "@/features/auth/useSession";
import { env } from "@/lib/env";
import { loginHref } from "@/lib/safe-redirect";

/** "Accueil" is the logo; "Mon compte" only when signed in. */
const NAV_ITEMS = [
  { href: "/search", label: "Rechercher" },
  { href: "/offer", label: "Proposer un trajet" },
  { href: "/trips", label: "Mes trajets" },
  { href: "/messages", label: "Messages" },
] as const;
const ACCOUNT_ITEM = { href: "/account", label: "Mon compte" } as const;
/** Only shown to administrators; the bottom tab bar stays passenger-oriented. */
const ADMIN_ITEM = { href: "/admin", label: "Admin" } as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * < 768px: logo only (navigation lives in the bottom tab bar).
 * 768–1023px: compact menu button. >= 1024px: inline nav, never wraps.
 */
export function SiteHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const session = useSession();
  const isLoggedIn = session.status === "authenticated";
  const isAdmin = isLoggedIn && session.user.role === "admin";
  const navItems = isAdmin
    ? [...NAV_ITEMS, ACCOUNT_ITEM, ADMIN_ITEM]
    : isLoggedIn
      ? [...NAV_ITEMS, ACCOUNT_ITEM]
      : NAV_ITEMS;
  const closeMenu = () => setIsMenuOpen(false);

  return (
    <header className="sticky top-0 z-30 border-b border-page-border bg-white/95 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex min-h-11 shrink-0 items-center gap-2.5" aria-label={`${env.appName}, accueil`}>
          <span className="grid h-9 w-9 place-items-center rounded-[var(--radius-control)] bg-primary-strong text-white">
            <CarFront className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="font-heading text-base font-semibold text-page-text">{env.appName}</span>
            <span className="text-sm text-page-muted">Covoiturage de proximité</span>
          </span>
        </Link>

        <nav aria-label="Navigation principale" className="hidden items-center gap-1 whitespace-nowrap lg:flex">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={
                  "inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-3 text-sm font-medium transition-colors " +
                  (active ? "bg-active text-primary-strong" : "text-page-muted hover:text-page-text")
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <AuthActions />
          <button
            type="button"
            className="hidden h-11 w-11 place-items-center rounded-[var(--radius-control)] border border-page-border text-page-muted md:grid lg:hidden"
            aria-expanded={isMenuOpen}
            aria-controls="compact-navigation"
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            {isMenuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            <span className="sr-only">{isMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}</span>
          </button>
        </div>
      </Container>

      {isMenuOpen && (
        <div id="compact-navigation" className="hidden border-t border-page-border bg-white md:block lg:hidden">
          <Container className="py-3">
            <nav aria-label="Navigation principale" className="grid gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMenu}
                  aria-current={isActive(pathname, item.href) ? "page" : undefined}
                  className="flex min-h-11 items-center rounded-[var(--radius-control)] px-3 text-base text-page-text hover:bg-brand-50"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            {session.status === "anonymous" && (
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-page-border pt-3">
                <Link href={loginHref(pathname)} onClick={closeMenu} className={buttonClasses("secondary", "!w-full")}>
                  Connexion
                </Link>
                <Link href="/signup" onClick={closeMenu} className={buttonClasses("primary", "!w-full")}>
                  Inscription
                </Link>
              </div>
            )}
          </Container>
        </div>
      )}
    </header>
  );
}
