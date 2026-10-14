"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardTitle } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { PASSWORD_RESET_FLAG } from "@/lib/account-flags";
import { ApiError, resetPassword } from "@/lib/api";
import { retryAfterMinutes } from "@/lib/retry-after";

const MIN_LENGTH = 12;

/** Token from `?token=` or from the fragment (`#token=...` or bare `#<token>`). */
function readToken(): string | null {
  const fromQuery = new URLSearchParams(window.location.search).get("token");
  if (fromQuery) return fromQuery;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  return new URLSearchParams(hash).get("token") ?? (hash.includes("=") ? null : hash);
}

type Status = "loading" | "ready" | "invalid";

export function ResetPasswordForm() {
  const router = useRouter();
  // Token lives only in this component's state; it is wiped from the URL on load.
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const found = readToken();
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the URL once, browser-only
    setToken(found && found.length >= 20 ? found : null);
    setStatus(found && found.length >= 20 ? "ready" : "invalid");
  }, []);

  const mismatch = confirm !== "" && password !== confirm;
  const tooShort = password !== "" && password.length < MIN_LENGTH;

  if (status === "loading") {
    return (
      <section className="page-section">
        <Container className="max-w-md">Chargement...</Container>
      </section>
    );
  }

  if (status === "invalid" || token === null) {
    return (
      <section className="page-section">
        <Container className="max-w-md">
          <Card>
            <CardTitle>Ce lien n&apos;est plus valable</CardTitle>
            <CardBody>
              Le lien a expiré, a déjà servi ou est incomplet. Demandez-en un nouveau.
            </CardBody>
            <div className="mt-4">
              <Link
                href="/forgot-password"
                className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-control)] bg-primary-strong px-5 text-base font-medium text-white hover:bg-primary-hover"
              >
                Demander un nouveau lien
              </Link>
            </div>
          </Card>
        </Container>
      </section>
    );
  }

  return (
    <section className="page-section">
      <Container className="max-w-md">
        <Card>
          <div className="mb-3">
            <CardTitle>Nouveau mot de passe</CardTitle>
          </div>
          <ul id="reset-password-rules" className="mb-4 list-disc pl-5 text-sm text-slate-600">
            <li>au moins {MIN_LENGTH} caractères ;</li>
            <li>pas de mot de passe courant (ex. « motdepasse123 »).</li>
          </ul>
          <form
            className="grid gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              if (password.length < MIN_LENGTH || password !== confirm) return;
              setIsSubmitting(true);
              setError(null);
              try {
                await resetPassword(token, password);
                setPassword("");
                setConfirm("");
                try {
                  sessionStorage.setItem(PASSWORD_RESET_FLAG, "1");
                } catch {
                  // Storage unavailable: redirect anyway.
                }
                router.push("/login");
              } catch (err: unknown) {
                if (err instanceof ApiError && err.status === 400) {
                  setToken(null);
                  setStatus("invalid");
                } else if (err instanceof ApiError && err.status === 422) {
                  setError(
                    `Mot de passe refusé : ${MIN_LENGTH} caractères minimum et pas de mot de passe courant.`,
                  );
                } else if (err instanceof ApiError && err.status === 429) {
                  setError(
                    err.retryAfter !== null
                      ? `Trop de tentatives, réessayez dans ${retryAfterMinutes(err.retryAfter)} minute(s).`
                      : "Trop de tentatives, réessayez dans quelques minutes.",
                  );
                } else {
                  setError("Impossible de modifier le mot de passe. Réessayez.");
                }
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            <div>
              <label htmlFor="reset-password" className="label">
                Nouveau mot de passe
              </label>
              <input
                id="reset-password"
                type={showPassword ? "text" : "password"}
                className="field"
                autoComplete="new-password"
                minLength={MIN_LENGTH}
                maxLength={256}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby={tooShort ? "reset-password-rules reset-too-short" : "reset-password-rules"}
                aria-invalid={tooShort || undefined}
              />
              {tooShort && (
                <p id="reset-too-short" className="mt-1 text-sm text-rose-700">
                  {MIN_LENGTH} caractères minimum.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="reset-password-confirm" className="label">
                Confirmer le mot de passe
              </label>
              <input
                id="reset-password-confirm"
                type={showPassword ? "text" : "password"}
                className="field"
                autoComplete="new-password"
                maxLength={256}
                required
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                aria-describedby={mismatch ? "reset-mismatch" : undefined}
                aria-invalid={mismatch || undefined}
              />
              {mismatch && (
                <p id="reset-mismatch" className="mt-1 text-sm text-rose-700">
                  Les deux mots de passe ne correspondent pas.
                </p>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(event) => setShowPassword(event.target.checked)}
              />
              Afficher les mots de passe
            </label>
            {error && (
              <p role="alert" className="text-sm text-rose-700">
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={
                isSubmitting || password.length < MIN_LENGTH || confirm === "" || mismatch
              }
            >
              {isSubmitting ? "Enregistrement..." : "Changer le mot de passe"}
            </Button>
          </form>
        </Card>
      </Container>
    </section>
  );
}
