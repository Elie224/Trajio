import { MapPin, ShieldCheck, Wallet } from "lucide-react";

import { Container } from "@/components/ui/Container";
import { Card, CardBody, CardTitle } from "@/components/ui/Card";
import { AccountDeletedNotice } from "@/features/auth/AccountDeletedNotice";
import { HomeSearchPanel } from "@/features/search/HomeSearchPanel";

const HOW_IT_WORKS = [
  {
    title: "Renseignez votre trajet",
    description: "Choisissez départ, destination, date, heure et nombre de passagers.",
  },
  {
    title: "Comparez les conducteurs",
    description: "Visualisez les profils, prix, places disponibles et compatibilité d'itinéraire.",
  },
  {
    title: "Réservez en confiance",
    description: "Échangez dans la messagerie intégrée puis confirmez votre réservation.",
  },
] as const;

const BENEFITS = [
  {
    title: "Proximité intelligente",
    Icon: MapPin,
    description:
      "Trajio cible les conducteurs qui passent réellement près de vous, pas seulement les mêmes villes.",
  },
  {
    title: "Coûts maîtrisés",
    Icon: Wallet,
    description: "Partage des frais transparent avec estimation du prix et suivi des places en direct.",
  },
  {
    title: "Confiance et sécurité",
    Icon: ShieldCheck,
    description: "Profils vérifiés, historique, messagerie contextuelle et signalement intégré.",
  },
] as const;

export default function Home() {
  return (
    <>
      <AccountDeletedNotice />
      <section className="home-hero border-b border-page-border">
        <Container className="py-10 lg:py-14">
          <HomeSearchPanel />
        </Container>
      </section>

      <section className="page-section">
        <Container>
          <div className="grid gap-5 lg:grid-cols-3">
            {HOW_IT_WORKS.map((step, index) => (
              <Card key={step.title} className="h-full">
                <span className="mb-4 grid h-10 w-10 place-items-center rounded-[var(--radius-control)] bg-accent font-heading font-semibold text-page-text">
                  <span className="sr-only">Étape </span>{index + 1}
                </span>
                <CardTitle>{step.title}</CardTitle>
                <CardBody>{step.description}</CardBody>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-y border-page-border bg-white page-section">
        <Container>
          <h2 className="text-2xl font-semibold tracking-tight text-page-text">
            Pourquoi choisir Trajio ?
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {BENEFITS.map((item) => (
              <Card key={item.title} className="h-full">
                <span className="mb-4 grid h-10 w-10 place-items-center rounded-[var(--radius-control)] bg-active text-primary-strong">
                  <item.Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <CardTitle>{item.title}</CardTitle>
                <CardBody>{item.description}</CardBody>
              </Card>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
