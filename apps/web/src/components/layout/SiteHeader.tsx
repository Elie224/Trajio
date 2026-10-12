import Link from "next/link";

import { Container } from "@/components/ui/Container";
import { env } from "@/lib/env";

export function SiteHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white"
          >
            T
          </span>
          <span className="text-lg font-semibold tracking-tight text-slate-900">{env.appName}</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-slate-600 sm:flex">
          <span className="cursor-not-allowed opacity-50">Recherche</span>
          <span className="cursor-not-allowed opacity-50">Trajets</span>
          <span className="cursor-not-allowed opacity-50">Messages</span>
        </nav>
      </Container>
    </header>
  );
}
