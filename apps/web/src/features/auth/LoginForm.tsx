"use client";
import { ServiceError } from "@/components/ui/ServiceError";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardTitle } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { PASSWORD_RESET_FLAG } from "@/lib/account-flags";
import { resetSession } from "@/features/auth/session";
import { ApiError, login } from "@/lib/api";
import { env } from "@/lib/env";
import { SERVICE_UNAVAILABLE_MESSAGE, userFacingError } from "@/lib/errors";
import { retryAfterMinutes } from "@/lib/retry-after";
import { safeNextPath } from "@/lib/safe-redirect";

export function LoginForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Timestamp (ms) until which the submit button stays disabled after a 429.
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const registration = new URLSearchParams(window.location.search).get("registration");
    if (registration === "complete" || registration === "verify-email") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only URL once
      setNotice(
        registration === "verify-email"
          ? "Demande d'inscription reçue. Consultez vos emails pour confirmer votre adresse avant de vous connecter."
          : "Inscription terminée. Saisissez votre email et votre mot de passe pour vous connecter.",
      );
    }
    try {
      if (sessionStorage.getItem(PASSWORD_RESET_FLAG)) {
        sessionStorage.removeItem(PASSWORD_RESET_FLAG);
        setNotice("Mot de passe modifié, vous avez été déconnecté de tous vos appareils.");
      }
    } catch {
      // Storage unavailable: nothing to show.
    }
  }, []);

  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (lockedUntil === null) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= lockedUntil) {
        setLockedUntil(null);
        setError(null);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  const remainingSeconds = lockedUntil === null ? 0 : Math.max(0, Math.ceil((lockedUntil - now) / 1000));
  const isLocked = lockedUntil !== null && remainingSeconds > 0;

  return (
    <section className="page-section">
      <Container className="max-w-md">
        <Card>
          <div className="mb-5">
            <CardTitle>Connexion</CardTitle>
          </div>
          {notice && (
            <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {notice}
            </p>
          )}
          <form
            className="grid gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              setIsSubmitting(true);
              setError(null);
              const formData = new FormData(event.currentTarget);

              try {
                await login(
                  String(formData.get("email") ?? ""),
                  String(formData.get("password") ?? ""),
                );
                resetSession();
                const next = new URLSearchParams(window.location.search).get("next");
                router.push(safeNextPath(next, window.location.origin));
                router.refresh();
              } catch (err: unknown) {
                if (err instanceof ApiError && err.status === 429) {
                  // Same message whatever the email (no account enumeration).
                  if (err.retryAfter !== null) {
                    const minutes = retryAfterMinutes(err.retryAfter);
                    setError(
                      `Trop de tentatives, réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}.`,
                    );
                    const until = Date.now() + Math.max(1, err.retryAfter) * 1000;
                    setNow(Date.now());
                    setLockedUntil(until);
                  } else {
                    setError("Trop de tentatives, réessayez dans quelques minutes.");
                  }
                } else {
                  setError(userFacingError(err, "Impossible de se connecter."));
                }
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            <div>
              <label htmlFor="login-email" className="label">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="field"
                placeholder="vous@trajio.fr"
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="label">
                Mot de passe
              </label>
              <input
                id="login-password"
                type="password"
                name="password"
                className="field"
                placeholder="••••••••"
                minLength={1}
                required
                autoComplete="current-password"
              />
            </div>
            {error === SERVICE_UNAVAILABLE_MESSAGE ? (
              <ServiceError submitForm />
            ) : (
              error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )
            )}
            <Button type="submit" disabled={isSubmitting || isLocked}>
              {isSubmitting
                ? "Connexion..."
                : isLocked
                  ? `Se connecter (${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")})`
                  : "Se connecter"}
            </Button>
              {env.passwordResetEnabled && (
              <Link
                href={email ? `/forgot-password?email=${encodeURIComponent(email)}` : "/forgot-password"}
                className="text-center text-sm font-medium text-brand-700 hover:text-brand-800"
              >
                Mot de passe oublié ?
              </Link>
            )}
          </form>
          <CardBody>
            Pas encore de compte ?{" "}
            <Link href="/signup" className="font-medium text-brand-700 hover:text-brand-800">
              Créer un compte
            </Link>
          </CardBody>
        </Card>
      </Container>
    </section>
  );
}
