"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, CarFront, MapPinned } from "lucide-react";

import { Container } from "@/components/ui/Container";
import { AuthActions } from "@/features/auth/AuthActions";
import { env } from "@/lib/env";
import { loginHref } from "@/lib/safe-redirect";

const NAV_ITEMS = [
  { href: "/", label: "Accueil" },
  { href: "/search", label: "Rechercher" },
  { href: "/offer", label: "Proposer un trajet" },
  { href: "/trips", label: "Mes trajets" },
  { href: "/messages", label: "Messages" },
  { href: "/account", label: "Mon compte" },
] as const;

export function SiteHeader() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  const closeMenu = () => setIsMobileMenuOpen(false);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white shadow-sm">
            <CarFront className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="flex flex-col leading-none">
            <span className="text-[1.02rem] font-semibold tracking-tight text-slate-900">
              {env.appName}
            </span>
            <span className="text-[0.71rem] font-medium uppercase tracking-[0.13em] text-brand-700">
              covoiturage de proximité
            </span>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 lg:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="transition-colors hover:text-slate-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <AuthActions />

        <button
          type="button"
          className="rounded-xl border border-slate-200 p-2 text-slate-600 sm:hidden"
          aria-expanded={isMobileMenuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setIsMobileMenuOpen((open) => !open)}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
          <span className="sr-only">Ouvrir le menu</span>
        </button>
      </Container>

      {isMobileMenuOpen && (
        <div id="mobile-navigation" className="border-t border-slate-200 bg-white sm:hidden">
          <Container className="py-3">
            <div className="surface p-3">
              <div className="mb-2 flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                <MapPinned className="h-3.5 w-3.5" /> Navigation
              </div>
              <div className="flex flex-col gap-1">
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMenu}
                    className="rounded-lg px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                <Link
                  href={loginHref(pathname)}
                  onClick={closeMenu}
                  className="rounded-lg border border-slate-200 px-2.5 py-2 text-center text-sm font-medium text-slate-700"
                >
                  Connexion
                </Link>
                <Link
                  href="/signup"
                  onClick={closeMenu}
                  className="rounded-lg bg-brand-600 px-2.5 py-2 text-center text-sm font-medium text-white"
                >
                  Inscription
                </Link>
              </div>
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}
