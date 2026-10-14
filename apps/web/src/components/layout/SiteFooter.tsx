"use client";

import { usePathname } from "next/navigation";

import { Container } from "@/components/ui/Container";

export function SiteFooter() {
  // /search is a full-screen map: no footer under it.
  if (usePathname() === "/search") return null;
  return (
    <footer className="mt-auto border-t border-page-border bg-white">
      <Container className="py-10">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <p className="text-base font-semibold text-page-text">Trajio</p>
            <p className="mt-2 text-sm leading-6 text-page-muted">
              Même direction, partageons le trajet. Une expérience de covoiturage locale,
              fluide et pensée pour la confiance.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-page-muted">Produit</p>
            <ul className="mt-3 space-y-2 text-sm text-page-muted">
              <li>Recherche de trajets</li>
              <li>Publication de trajets</li>
              <li>Messagerie sécurisée</li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-page-muted">
              Notre engagement
            </p>
            <p className="mt-3 text-sm leading-6 text-page-muted">
              Trajio évolue en continu pour proposer une expérience de covoiturage fiable,
              claire et sécurisée à chaque étape du trajet.
            </p>
          </div>
        </div>
        <div className="mt-8 border-t border-page-border pt-5 text-xs text-page-muted">
          © Trajio — Fondation produit en évolution continue.
        </div>
      </Container>
    </footer>
  );
}
