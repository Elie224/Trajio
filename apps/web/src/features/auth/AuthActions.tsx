"use client";

import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { usePathname } from "next/navigation";

import { clearUserSessionData } from "@/features/auth/session";
import { useSession } from "@/features/auth/useSession";
import { logout } from "@/lib/api";
import { loginHref } from "@/lib/safe-redirect";

export function AuthActions() {
  const state = useSession();
  const pathname = usePathname();

  if (state.status === "loading") {
    return <p className="hidden text-xs text-page-muted md:block">Session…</p>;
  }

  if (state.status === "anonymous") {
    return (
      <div className="hidden items-center gap-2 md:flex">
        <Link
          href={loginHref(pathname)}
          className={buttonClasses("secondary", "!min-h-11 !w-auto px-4 text-sm")}
        >
          Connexion
        </Link>
        <Link
          href="/signup"
          className={buttonClasses("primary", "!min-h-11 !w-auto px-4 text-sm")}
        >
          Inscription
        </Link>
      </div>
    );
  }

  if (state.status === "error") {
    return <p className="hidden text-xs text-danger md:block">Session indisponible : {state.message}</p>;
  }

  return (
    <div className="hidden items-center gap-3 md:flex">
      <Link href="/account" className="hidden whitespace-nowrap text-sm text-page-text hover:text-primary-strong xl:inline" title="Mon compte">
        Bonjour <span className="font-semibold">{state.user.first_name}</span>
      </Link>
      <button
        className={buttonClasses("secondary", "!min-h-11 !w-auto px-4 text-sm")}
        onClick={async () => {
          try {
            await logout();
          } finally {
            clearUserSessionData();
          }
          window.location.reload();
        }}
        type="button"
      >
        Déconnexion
      </button>
    </div>
  );
}

