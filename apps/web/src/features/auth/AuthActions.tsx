"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { fetchCurrentUser, logout, type UserProfile } from "@/lib/api";

type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: UserProfile }
  | { status: "error"; message: string };

export function AuthActions() {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    fetchCurrentUser()
      .then((user) => setState({ status: "authenticated", user }))
      .catch((error: unknown) => {
        if (error instanceof Error && error.message.includes("Non authentifié")) {
          setState({ status: "anonymous" });
          return;
        }
        if (error instanceof Error && error.message.includes("401")) {
          setState({ status: "anonymous" });
          return;
        }
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Erreur inattendue",
        });
      });
  }, []);

  if (state.status === "loading") {
    return <p className="hidden text-xs text-slate-500 sm:block">Session…</p>;
  }

  if (state.status === "anonymous") {
    return (
      <div className="hidden items-center gap-2 sm:flex">
        <Link
          href="/login"
          className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        >
          Connexion
        </Link>
        <Link
          href="/signup"
          className="rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
        >
          Inscription
        </Link>
      </div>
    );
  }

  if (state.status === "error") {
    return <p className="hidden text-xs text-rose-600 sm:block">Session indisponible : {state.message}</p>;
  }

  return (
    <div className="hidden items-center gap-3 sm:flex">
      <Link href="/account" className="text-sm text-slate-700 hover:text-slate-900" title="Mon compte">
        Bonjour <span className="font-semibold">{state.user.first_name}</span>
      </Link>
      <button
        className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        onClick={async () => {
          await logout();
          window.location.reload();
        }}
        type="button"
      >
        Déconnexion
      </button>
    </div>
  );
}

