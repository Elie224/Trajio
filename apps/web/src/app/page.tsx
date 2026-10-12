import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardTitle } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { ApiStatusCard } from "@/features/system-health/ApiStatusCard";

/** Business modules are listed to document the plan, not to imply they exist. */
const MODULES = [
  { name: "Authentification", description: "Inscription, connexion JWT, roles, verification." },
  { name: "Profils et vehicules", description: "Profil conducteur ou passager, vehicles declares." },
  { name: "Trajets", description: "Publication, recurrence, arrets et horaires." },
  { name: "Recherche geographique", description: "Rayon, direction, horaires et detour acceptables." },
  { name: "Matching", description: "Classement geospatial transparent et explicable." },
  { name: "Reservations", description: "Demande, acceptation, refus, annulation." },
  { name: "Messagerie", description: "Conversations liees a une reservation." },
  { name: "Evaluations", description: "Note et avis bilatere apres un trajet effectue." },
  { name: "Signalements", description: "Moderation, verification des comptes, audit." },
] as const;

const FOUNDATION = [
  { label: "Next.js App Router", detail: "React 19, TypeScript, Tailwind CSS v4" },
  { label: "FastAPI", detail: "Python 3.11, Pydantic v2, SQLAlchemy 2" },
  { label: "PostgreSQL + PostGIS", detail: "geographie, index spatiaux, migrations Alembic" },
  { label: "Docker Compose", detail: "un fichier, trois services reproductibles" },
  { label: "MapLibre GL JS", detail: "fond OpenStreetMap, fournisseur de tuiles isole" },
] as const;

export default function Home() {
  return (
    <>
      <section className="border-b border-slate-200 bg-white">
        <Container className="py-16 sm:py-24">
          <Badge tone="success">Fondation technique v0.1.0</Badge>
          <h1 className="mt-6 max-w-3xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Même direction, partageons le trajet.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            Trajio rapproche les conducteurs qui ont des places libres et les passagers qui vont
            dans la même direction, même si les points de départ et d&apos;arrivée diffèrent.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button disabled>Rechercher un trajet — bientôt disponible</Button>
            <Button variant="secondary" disabled>
              Proposer un trajet — bientôt disponible
            </Button>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Aucun module métier n&apos;est encore activé : cette page valide uniquement la
            fondation technique.
          </p>
        </Container>
      </section>

      <Container className="py-12">
        <div className="grid gap-6 lg:grid-cols-2">
          <ApiStatusCard />
          <Card>
            <CardTitle>Socle technique en place</CardTitle>
            <CardBody>
              <dl className="mt-2 divide-y divide-slate-100">
                {FOUNDATION.map((item) => (
                  <div key={item.label} className="flex flex-col py-2.5 sm:flex-row sm:gap-4">
                    <dt className="w-48 shrink-0 font-medium text-slate-800">{item.label}</dt>
                    <dd className="text-slate-600">{item.detail}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        </div>
      </Container>

      <section className="border-t border-slate-200 bg-white">
        <Container className="py-12">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
            Modules métier prévus
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            L&apos;architecture les accueille tous. Aucun n&apos;est implémenté à ce stade, afin
            de valider le modèle de données avant d&apos;écrire la logique.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((module) => (
              <li key={module.name}>
                <Card className="h-full">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle>{module.name}</CardTitle>
                    <Badge tone="neutral">à venir</Badge>
                  </div>
                  <CardBody>{module.description}</CardBody>
                </Card>
              </li>
            ))}
          </ul>
        </Container>
      </section>
    </>
  );
}
