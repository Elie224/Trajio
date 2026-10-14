import { Container } from "@/components/ui/Container";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <Container className="py-10">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <p className="text-base font-semibold text-slate-900">Trajio</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Même direction, partageons le trajet. Une expérience de covoiturage locale,
              fluide et pensée pour la confiance.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.1em] text-slate-500">Produit</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>Recherche de trajets</li>
              <li>Publication de trajets</li>
              <li>Messagerie sécurisée</li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.1em] text-slate-500">
              Notre engagement
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Trajio évolue en continu pour proposer une expérience de covoiturage fiable,
              claire et sécurisée à chaque étape du trajet.
            </p>
          </div>
        </div>
        <div className="mt-8 border-t border-slate-100 pt-5 text-xs text-slate-500">
          © Trajio — Fondation produit en évolution continue.
        </div>
      </Container>
    </footer>
  );
}
