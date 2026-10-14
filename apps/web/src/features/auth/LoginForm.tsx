"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardTitle } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { login } from "@/lib/api";
import { safeNextPath } from "@/lib/safe-redirect";

export function LoginForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="page-section">
      <Container className="max-w-md">
        <Card>
          <div className="mb-5">
            <CardTitle>Connexion</CardTitle>
          </div>
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
                const next = new URLSearchParams(window.location.search).get("next");
                router.push(safeNextPath(next, window.location.origin));
                router.refresh();
              } catch (err: unknown) {
                setError(err instanceof Error ? err.message : "Impossible de se connecter.");
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
            {error && <p className="text-sm text-rose-700">{error}</p>}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Connexion..." : "Se connecter"}
            </Button>
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
