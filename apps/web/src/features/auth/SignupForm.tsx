"use client";
import { ServiceError } from "@/components/ui/ServiceError";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardTitle } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { register } from "@/lib/api";
import { SERVICE_UNAVAILABLE_MESSAGE, userFacingError } from "@/lib/errors";

export function SignupForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="page-section">
      <Container className="max-w-2xl">
        <Card>
          <div className="mb-5">
            <CardTitle>Inscription</CardTitle>
          </div>
          <form
            className="grid gap-3 md:grid-cols-2"
            onSubmit={async (event) => {
              event.preventDefault();
              setIsSubmitting(true);
              setError(null);
              const formData = new FormData(event.currentTarget);
              const password = String(formData.get("password") ?? "");
              const passwordConfirm = String(formData.get("password_confirm") ?? "");
              if (password !== passwordConfirm) {
                setIsSubmitting(false);
                setError("Les mots de passe ne correspondent pas.");
                return;
              }

              try {
                const result = await register({
                  firstName: String(formData.get("first_name") ?? ""),
                  lastName: String(formData.get("last_name") ?? ""),
                  email: String(formData.get("email") ?? ""),
                  password,
                });
                router.replace(
                  result.verification_required
                    ? "/login?registration=verify-email"
                    : "/login?registration=complete",
                );
              } catch (err: unknown) {
                setError(userFacingError(err, "Impossible de créer le compte."));
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            <div>
              <label htmlFor="signup-firstname" className="label">
                Prénom
              </label>
              <input id="signup-firstname" name="first_name" className="field" required autoComplete="given-name" />
            </div>
            <div>
              <label htmlFor="signup-lastname" className="label">
                Nom
              </label>
              <input id="signup-lastname" name="last_name" className="field" required autoComplete="family-name" />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="signup-email" className="label">
                Email
              </label>
              <input
                id="signup-email"
                name="email"
                type="email"
                className="field"
                placeholder="vous@trajio.fr"
                required
                autoComplete="email"
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="signup-password" className="label">
                Mot de passe
              </label>
              <input
                id="signup-password"
                name="password"
                type="password"
                className="field"
                minLength={12}
                required
                autoComplete="new-password"
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="signup-password-confirm" className="label">
                Confirmer le mot de passe
              </label>
              <input
                id="signup-password-confirm"
                name="password_confirm"
                type="password"
                className="field"
                minLength={12}
                required
                autoComplete="new-password"
              />
            </div>
            {error === SERVICE_UNAVAILABLE_MESSAGE ? (
              <ServiceError submitForm className="md:col-span-2" />
            ) : (
              error && (
                <p role="alert" className="md:col-span-2 text-sm text-danger">
                  {error}
                </p>
              )
            )}
            <div className="md:col-span-2">
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? "Création..." : "Créer mon compte"}
              </Button>
            </div>
          </form>
          <CardBody>
            Déjà inscrit ?{" "}
            <Link href="/login" className="font-medium text-brand-700 hover:text-brand-800">
              Se connecter
            </Link>
          </CardBody>
        </Card>
      </Container>
    </section>
  );
}
