"use client";

import { Container } from "@/components/ui/Container";
import { AccountDataSettings } from "@/features/auth/AccountDataSettings";
import { SessionStatus } from "@/features/auth/SessionStatus";
import { useSession } from "@/features/auth/useSession";

export function AccountSettings() {
  const session = useSession();

  if (session.status !== "authenticated") {
    return (
      <SessionStatus
        session={session}
        loadingLabel="Chargement de votre compte…"
        anonymousBody="Connectez-vous pour gérer votre compte."
      />
    );
  }

  return (
    <section className="page-section">
      <Container className="grid max-w-3xl gap-5">
        <h1 className="text-2xl font-semibold tracking-tight text-page-text">Mon compte</h1>
        <AccountDataSettings />
      </Container>
    </section>
  );
}
