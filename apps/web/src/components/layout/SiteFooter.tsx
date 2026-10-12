import { Container } from "@/components/ui/Container";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-slate-50">
      <Container className="flex flex-col gap-2 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>Trajio — Même direction, partageons le trajet.</p>
        <p>Fondation technique v0.1.0 — aucun module métier activé.</p>
      </Container>
    </footer>
  );
}
