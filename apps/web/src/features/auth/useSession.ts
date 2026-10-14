"use client";

import { useEffect, useState } from "react";

import { getSession, onSessionChange } from "@/features/auth/session";
import type { UserProfile } from "@/lib/api";

export type SessionState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: UserProfile }
  | { status: "error"; message: string };

/** Current session, refetched whenever resetSession() is called. */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    const load = () => {
      getSession()
        .then((user) => {
          if (active) setState(user ? { status: "authenticated", user } : { status: "anonymous" });
        })
        .catch((error: unknown) => {
          if (active) {
            setState({
              status: "error",
              message: error instanceof Error ? error.message : "Erreur inattendue",
            });
          }
        });
    };
    load();
    const unsubscribe = onSessionChange(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return state;
}
