import Link from "next/link";

import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardTitle } from "@/components/ui/Card";
import { ApiStatusCard } from "@/features/system-health/ApiStatusCard";
import { TrajioMap } from "@/features/map/TrajioMap";

const HOW_IT_WORKS = [
  {
    title: "1. Renseignez votre trajet",
    description: "Choisissez départ, destination, date, heure et nombre de passagers.",
  },
  {
    title: "2. Comparez les conducteurs",
    description: "Visualisez les profils, prix, places disponibles et compatibilité d'itinéraire.",
  },
  {
    title: "3. Réservez en confiance",
    description: "Échangez dans la messagerie intégrée puis confirmez votre réservation.",
  },
] as const;

const BENEFITS = [
  {
    title: "Proximité intelligente",
    description:
      "Trajio cible les conducteurs qui passent réellement près de vous, pas seulement les mêmes villes.",
  },
  {
    title: "Coûts maîtrisés",
    description: "Partage des frais transparent avec estimation du prix et suivi des places en direct.",
  },
  {
    title: "Confiance et sécurité",
    description: "Profils vérifiés, historique, messagerie contextuelle et signalement intégré.",
  },
] as const;

export default function Home() {
  return (
    <>
      <section className="border-b border-slate-200 bg-white">
        <Container className="grid gap-8 py-10 lg:grid-cols-[1.05fr_1fr] lg:py-14">
          <div>
            <Badge tone="success">Lancement local • Phase 1 UI/UX</Badge>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl">
              Même direction, partageons le trajet.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              Trajio rapproche les conducteurs ayant des places libres et les passagers qui vont
              dans la même direction, même lorsque les points de départ et d&apos;arrivée diffèrent.
            </p>

            <form action="/search" className="surface mt-7 grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
              <div>
                <label htmlFor="home-pickup" className="label">
                  Départ
                </label>
                <input
                  id="home-pickup"
                  name="pickup"
                  className="field"
                  defaultValue="Saint-Denis"
                  placeholder="Adresse de départ"
                />
              </div>
              <div>
                <label htmlFor="home-dropoff" className="label">
                  Destination
                </label>
                <input
                  id="home-dropoff"
                  name="dropoff"
                  className="field"
                  defaultValue="Paris"
                  placeholder="Adresse d'arrivée"
                />
              </div>
              <div>
                <label htmlFor="home-date" className="label">
                  Date
                </label>
                <input id="home-date" name="date" type="date" className="field" />
              </div>
              <div>
                <label htmlFor="home-time" className="label">
                  Heure
                </label>
                <input id="home-time" name="time" type="time" className="field" />
              </div>
              <div>
                <label htmlFor="home-passengers" className="label">
                  Passagers
                </label>
                <input
                  id="home-passengers"
                  name="passengers"
                  type="number"
                  min={1}
                  max={6}
                  defaultValue={1}
                  className="field"
                />
              </div>
              <div className="flex items-end gap-2">
                <Button type="submit" className="w-full">
                  Rechercher un trajet
                </Button>
                <Link
                  href="/offer"
                  className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Proposer un trajet
                </Link>
              </div>
            </form>
          </div>

          <div className="surface p-3">
            <div className="mb-2 px-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
              Carte interactive
            </div>
            <div className="h-[320px] sm:h-[420px]">
              <TrajioMap
                pickup={[2.3615, 48.9542]}
                dropoff={[2.3553, 48.8809]}
                route={[
                  [2.3615, 48.9542],
                  [2.355, 48.931],
                  [2.352, 48.912],
                  [2.3553, 48.8809],
                ]}
              />
            </div>
          </div>
        </Container>
      </section>

      <section className="page-section">
        <Container>
          <div className="grid gap-5 lg:grid-cols-3">
            {HOW_IT_WORKS.map((step) => (
              <Card key={step.title} className="h-full">
                <CardTitle>{step.title}</CardTitle>
                <CardBody>{step.description}</CardBody>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-y border-slate-200 bg-white page-section">
        <Container>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
            Pourquoi choisir Trajio ?
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {BENEFITS.map((item) => (
              <Card key={item.title} className="h-full">
                <CardTitle>{item.title}</CardTitle>
                <CardBody>{item.description}</CardBody>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      <section className="page-section">
        <Container>
          <div className="grid gap-6 lg:grid-cols-2">
            <ApiStatusCard />
            <Card>
              <CardTitle>État des fonctionnalités</CardTitle>
              <CardBody>
                <ul className="space-y-2">
                  <li>• Recherche visuelle et carte interactive prêtes.</li>
                  <li>• Interfaces authentification, trajets et messages en place.</li>
                  <li>• Connexion API /health active pour vérifier l&apos;environnement.</li>
                  <li>• Moteur de matching et réservations : intégration backend à venir.</li>
                </ul>
              </CardBody>
            </Card>
          </div>
        </Container>
      </section>
    </>
  );
}
