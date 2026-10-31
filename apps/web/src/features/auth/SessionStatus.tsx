"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { buttonClasses } from "@/components/ui/Button";
import { Card, CardBody, CardTitle } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { ServiceError } from "@/components/ui/ServiceError";
import { resetSession } from "@/features/auth/session";
import type { SessionState } from "@/features/auth/useSession";
import { loginHref } from "@/lib/safe-redirect";

type GateState = Extract<SessionState, { status: "loading" | "anonymous" | "error" }>;

export function SessionStatus({
  session,
  loadingLabel,
  anonymousBody,
  showSignup = false,
}: {
  session: GateState;
  loadingLabel: string;
  anonymousBody: string;
  showSignup?: boolean;
}) {
  const pathname = usePathname();

  if (session.status === "loading") {
    return (
      <section className="page-section">
        <Container>{loadingLabel}</Container>
      </section>
    );
  }

  if (session.status === "anonymous") {
    return (
      <section className="page-section">
        <Container className="max-w-xl">
          <Card>
            <CardTitle>Connexion requise</CardTitle>
            <CardBody>{anonymousBody}</CardBody>
            <div className="mt-4 flex gap-2">
              <Link href={loginHref(pathname)} className={buttonClasses("primary")}>
                Se connecter
              </Link>
              {showSignup && (
                <Link href="/signup" className={buttonClasses("secondary")}>
                  Créer un compte
                </Link>
              )}
            </div>
          </Card>
        </Container>
      </section>
    );
  }

  return (
    <section className="page-section">
      <Container className="max-w-xl">
        <Card>
          <CardTitle>Erreur</CardTitle>
          <ServiceError className="mt-3" message={session.message} onRetry={() => resetSession()} />
        </Card>
      </Container>
    </section>
  );
}
