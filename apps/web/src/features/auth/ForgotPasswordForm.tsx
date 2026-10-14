"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardTitle } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { ApiError, requestPasswordReset } from "@/lib/api";
import { retryAfterMinutes } from "@/lib/retry-after";

const GENERIC_SENT =
  "Si un compte existe pour cette adresse, vous allez recevoir un lien valable 30 minutes.";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const prefill = new URLSearchParams(window.location.search).get("email");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the URL once, browser-only
    if (prefill) setEmail(prefill.slice(0, 254));
  }, []);

  return (
    <section className="page-section">
      <Container className="max-w-md">
        <Card>
          <div className="mb-5">
            <CardTitle>Mot de passe oublié</CardTitle>
          </div>
          {sent ? (
            <p role="status" className="text-sm leading-6 text-page-text">
              {GENERIC_SENT}
            </p>
          ) : (
            <form
              className="grid gap-3"
              onSubmit={async (event) => {
                event.preventDefault();
                setIsSubmitting(true);
                setError(null);
                try {
                  // The response may carry a dev-only reset_token: deliberately ignored.
                  await requestPasswordReset(email);
                  setSent(true);
                } catch (err: unknown) {
                  if (err instanceof ApiError && err.status === 429) {
                    if (err.retryAfter !== null) {
                      const minutes = retryAfterMinutes(err.retryAfter);
                      setError(
                        `Trop de tentatives, réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}.`,
                      );
                    } else {
                      setError("Trop de tentatives, réessayez dans quelques minutes.");
                    }
                  } else if (err instanceof ApiError && err.status === 422) {
                    setError("Adresse email invalide.");
                  } else {
                    // Same outcome as success: never reveal whether the account exists.
                    setSent(true);
                  }
                } finally {
                  setIsSubmitting(false);
                }
              }}
            >
              <CardBody>
                Indiquez l&apos;adresse de votre compte, nous vous enverrons un lien pour choisir un
                nouveau mot de passe.
              </CardBody>
              <div>
                <label htmlFor="forgot-email" className="label">
                  Email
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  name="email"
                  className="field"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Envoi..." : "Envoyer le lien"}
              </Button>
            </form>
          )}
          <p className="mt-4 text-sm">
            <Link href="/login" className="font-medium text-brand-700 hover:text-brand-800">
              Retour à la connexion
            </Link>
          </p>
        </Card>
      </Container>
    </section>
  );
}
