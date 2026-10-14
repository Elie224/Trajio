"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Card, CardBody, CardTitle } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { AccountDataSettings } from "@/features/auth/AccountDataSettings";
import { ApiError, fetchCurrentUser } from "@/lib/api";

type State = { status: "loading" } | { status: "anonymous" } | { status: "ready" } | { status: "error" };

/** /account: personal data export and account deletion, signed-in users only. */
export function AccountSettings() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchCurrentUser()
      .then(() => {
        if (!cancelled) setState({ status: "ready" });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const anonymous =
          (error instanceof ApiError && error.status === 401) ||
          (error instanceof Error && error.message.includes("Non authentifié"));
        setState({ status: anonymous ? "anonymous" : "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <section className="page-section">
        <Container>Chargement de votre compte…</Container>
      </section>
    );
  }

  if (state.status !== "ready") {
    return (
      <section className="page-section">
        <Container className="max-w-xl">
          <Card>
            <CardTitle>{state.status === "anonymous" ? "Connexion requise" : "Erreur"}</CardTitle>
            <CardBody>
              {state.status === "anonymous"
                ? "Connectez-vous pour gérer votre compte."
                : "Impossible de charger votre compte pour le moment."}
            </CardBody>
            {state.status === "anonymous" && (
              <div className="mt-4 flex gap-2">
                <Link
                  href="/login"
                  className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                >
                  Se connecter
                </Link>
              </div>
            )}
          </Card>
        </Container>
      </section>
    );
  }

  return (
    <section className="page-section">
      <Container className="grid max-w-3xl gap-5">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Mon compte</h1>
        <AccountDataSettings />
      </Container>
    </section>
  );
}
