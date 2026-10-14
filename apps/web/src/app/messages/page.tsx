import { MessageSquareMore } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardTitle } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";

export default function MessagesPage() {
  return (
    <section className="page-section">
      <Container>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-page-text sm:text-3xl">Messages</h1>
            <p className="mt-2 text-sm text-page-muted">
              Interface de messagerie préparée pour une communication sécurisée en temps réel.
            </p>
          </div>
          <Badge tone="warning">Backend à venir</Badge>
        </div>

        <div className="surface grid overflow-hidden lg:grid-cols-[320px_1fr]">
          <aside className="border-b border-page-border p-4 lg:border-r lg:border-b-0">
            <p className="text-xs font-semibold text-page-muted">Conversations</p>
            <div className="mt-4 rounded-xl border border-dashed border-page-border bg-brand-50 p-4 text-sm text-page-muted">
              Les conversations liées aux réservations apparaîtront ici.
            </div>
          </aside>

          <div className="p-6">
            <div className="mb-5 flex items-center gap-2 text-page-text">
              <MessageSquareMore className="h-4 w-4" />
              <h2 className="font-semibold">Sélectionnez une conversation</h2>
            </div>
            <Card>
              <CardTitle>Messagerie sécurisée en préparation</CardTitle>
              <CardBody>
                Les envois ne sont pas simulés. Cette vue prépare les états UX (vide, chargement, erreur)
                sans prétendre que la messagerie est déjà opérationnelle.
              </CardBody>
              <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                <input className="field" placeholder="Écrire un message" disabled />
                <Button type="button" disabled>
                  Envoyer
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </Container>
    </section>
  );
}
