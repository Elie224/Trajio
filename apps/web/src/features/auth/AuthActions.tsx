"use client";

import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { usePathname } from "next/navigation";

import { clearUserSessionData, resetSession } from "@/features/auth/session";
import { useSession } from "@/features/auth/useSession";
import { logout } from "@/lib/api";
import { SERVICE_UNAVAILABLE_MESSAGE } from "@/lib/errors";
import { loginHref } from "@/lib/safe-redirect";

export function AuthActions() {
  const state = useSession();
  const pathname = usePathname();

  if (state.status === "loading") {
    return <p className="hidden text-xs text-page-muted md:block">Session…</p>;
  }

  // Logged out, or API unreachable: same buttons, plus a non-blocking notice.
  if (state.status === "anonymous" || state.status === "error") {
    return (
      <div className="hidden items-center gap-2 md:flex">
        {state.status === "error" && (
          <p role="status" className="hidden items-center gap-2 text-sm text-page-muted xl:flex">
            <span>{SERVICE_UNAVAILABLE_MESSAGE}</span>
            <button
              type="button"
              onClick={() => resetSession()}
              className="inline-flex min-h-11 items-center font-medium text-primary-strong underline underline-offset-2"
            >
              Réessayer
            </button>
          </p>
        )}
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

