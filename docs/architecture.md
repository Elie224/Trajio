# Architecture de Trajio

> Fondation technique v0.1.0. Ce document decrit le socle tel qu'il est
> aujourd'hui. Aucun module metier n'est encore implemente.

## 1. Objectifs

Trajio est une application de covoiturage de proximite. Sa proposition de
valeur technique tient en une phrase : **trouver un conducteur qui va dans la
meme direction, meme si les points de depart et d'arrivee different**.

Cette capacite impose trois contraintes d'architecture :

1. **Geometrie du trajet** - un itineraire est une polyligne, pas une paire de
   points. Il faut donc comparer des lignes contre des points.
2. **Tolerance au detour** - la correspondance n'est pas binaire. C'est un
   score explicable : distance, ecart angulaire, detour, horaires.
3. **Cout marginal** - la base de clients est de type trajet quotidien. Le cout
   de la correspondance doit rester negligeable face au cout d'un trajet.

## 2. Perimetre de la v0.1.0

**Inclus** : monorepo, frontend Next.js, API FastAPI, base PostgreSQL/PostGIS
conteneurisee, migrations Alembic configurees, sondes de sante, tests,
documentation.

**Exclus volontairement** : authentification, publication de trajets, recherche,
reservations, messagerie, notifications, evaluations, signalements,
administration. Ces modules sont *places* dans l'arborescence et documentes,
mais leur logique n'est pas ecrite : le modele de donnees doit d'abord etre
valide (voir [database.md](./database.md)).

## 3. Vue d'ensemble

    Navigateur
         |
         |   HTTPS
         +------------------------------+
         |                              |
    +----v------+              +--------v---------+
    |  apps/web |              |     apps/api     |
    |  Next.js  |  -- JSON --> |     FastAPI      |
    |  React 19 |  <-- REST -- |     Python       |
    +----+------+              +--------+---------+
         |                              |
         |                       SQLAlchemy 2 (async)
         |                              |
         +--------------+---------------+
                        |
                +-------v---------+
                | PostgreSQL 16  |
                |   + PostGIS    |
                +-------+--------+
                        |
          OpenStreetMap / fournisseur de tuiles (externe)

Le navigateur parle directement a l'API : Next.js sert le socle HTML, et le
client execute les requetes metier. Ce modele evite un proxy inverse
supplementaire et garde la logique metier cote serveur, seul autorise a
appliquer les regles d'acces. Le contrat exact est dans
[api-design.md](./api-design.md).

## 4. Arborescence

    Trajio/
    |-- apps/
    |   |-- web/                  Frontend Next.js (App Router)
    |   |   |-- src/app/           Routes, layouts, styles globaux
    |   |   |-- src/components/    Composants reutilisables (ui/, layout/)
    |   |   |-- src/features/      Composants metas par fonction
    |   |   |-- src/lib/           Client API, configuration, styles de carte
    |   |   +-- Dockerfile         Image multi-etapes, sortie standalone
    |   |
    |   +-- api/                  Backend FastAPI
    |       |-- app/
    |       |   |-- api/v1/        Routeurs et controleurs HTTP
    |       |   |-- core/          Configuration, logs, erreurs, securite
    |       |   |-- db/            Moteur, session, base declarative, types
    |       |   |-- models/        ORM SQLAlchemy, un module par domaine
    |       |   |-- schemas/       Contrats Pydantic (entrees/sorties)
    |       |   |-- services/      Logique metier et transactions
    |       |   +-- matching/      Moteur de correspondance geographique
    |       |-- alembic/          Migrations de schema
    |       |-- tests/            Tests pytest
    |       +-- pyproject.toml     Declaration unique des dependances
    |
    |-- packages/                 Elements partages a venir (tokens, schemas TS)
    |-- infrastructure/           Configuration d'infra hors code applicatif
    |   +-- db/init/              Scripts SQL executes au premier demarrage
    |-- docs/                     Documentation d'architecture
    |-- scripts/                  Scripts PowerShell de developpement
    |-- compose.yaml              Pile de developpement
    +-- .env.example              Modele de configuration, sans secret

### Regle de dependance interne (backend)

    api/v1/endpoints  ->  services  ->  models / matching
           |                  ^
           |                  |
           +------> schemas <-+
           |
           +------> core (config, securite, erreurs)

- Un controleur fait trois choses : valider l'entree, appeler un service,
  serialiser.
- Un service est le seul layer autorise a ouvrir une transaction et a toucher
  plusieurs tables a la fois.
- Le module matching ne depend ni du module reservations ni du module trajets :
  il consomme des entrees et renvoie un score. L'algorithme peut donc etre
  remplace sans toucher au reste du domaine.
- core ne depend d'aucun module metier.

## 5. Frontend

| Sujet | Choix | Raison |
|---|---|---|
| Framework | Next.js 16 (App Router) | Rendu serveur, routes par fichiers, React 19 |
| Langage | TypeScript strict | Le matching manipule des geometries et des contrats d'API |
| Style | Tailwind CSS v4 | Jetons de design dans le CSS, pas de feuille globale a maintenir |
| Carte | MapLibre GL JS | Rendu GPU, source vectorielle ou raster, leger cote client |
| Etat | Aucun store global | Le serveur reste la source de verite ; Zustand au besoin |

L'arborescence suit la **colocation par fonctionnalite** :

- `components/ui/` : primitives sans connaissance du domaine (Button, Card,
  Badge, Container).
- `components/layout/` : chrome de l'application.
- `features/<fonctionnalite>/` : un dossier par fonctionnalite, avec ses
  composants et ses tests.
- `lib/` : acces aux donnees et configuration partagees.

`ApiStatusCard` est un exemple volontairement reel : il interroge
`GET /health` sur l'API. Il sert a la fois de demonstration et de test
d'integration permanent entre les deux moities du systeme.

## 6. Backend

| Sujet | Choix | Raison |
|---|---|---|
| Framework | FastAPI | Typage natif via Pydantic, OpenAPI automatique, async |
| ORM | SQLAlchemy 2 (async) | Requetes PostGIS possibles, session explicite |
| Drivers | asyncpg en application, psycopg pour Alembic | asyncpg rapide en concurrence ; psycopg pour les migrations |
| Migrations | Alembic | Une seule source de verite pour le schema |
| Validation | Pydantic v2 | Un seul modele pour valider et serialiser |
| Mots de passe | Argon2 via pwdlib | Resistance aux attaques GPU, recommandation OWASP |

### Statut du schema

`apps/api/app/models/` est **volontairement vide**. Le schema cible est
entierement specifie dans [database.md](./database.md). Les migrations seront
generees par `alembic revision --autogenerate` **apres** validation de ce
document, afin que le premier commit de schema soit discutable en revue.

## 7. Persistance

PostgreSQL 16 avec PostGIS 3.5. Contraintes structurantes :

- **SRID 4326 obligatoire.** Les colonnes geographiques sont en
  `geography(Point, 4326)` : PostGIS calcule les distances en metres sur le
  spheroide, et non en degres. Une erreur d'unite ici rend tout le matching
  faux.
- **Le schema appartient a Alembic.** L'application ne fait jamais de
  create_all ; elle suppose que le schema est a jour.
- **Index GiST sur chaque colonne geographique.** Sans lui, `ST_DWithin`
  degenererait en parcours sequentiel.
- **Une seule source de verite pour la configuration.** Alembic lit l'URL
  depuis `app.core.config`, exactement comme l'application.

## 8. Geospatial

Le matching est isole dans `apps/api/app/matching/` et repose sur des
operateurs PostGIS classiques. La version 1 ne contient ni modele predictif ni
LLM. Le raisonnement complet, y compris le SQL de generation de candidats et la
formule de score, est dans [matching.md](./matching.md).

## 9. Cartographie

MapLibre GL JS, avec le style centralise dans
`apps/web/src/lib/map/style.ts`.

Le developpement local utilise les tuiles raster publiques d'OpenStreetMap.
**Ce n'est pas tenable en production** : la politique d'usage de la Fondation
OpenStreetMap interdit un trafic applicatif soutenu sur les tuiles publiques.
Avant la mise en ligne, il faut choisir un fournisseur dedie, par exemple
tile.openstreetmap.fr pour la France, et ne changer que la constante
`OSM_RASTER_STYLE`.

## 10. Moteur d'itineraire (preparation)

Le calcul d'itineraire n'est pas implemente. L'architecture prevoit un module
dedie cote API qui :

1. Geocode le depart et l'arrivee.
2. Calcule une polyligne via un moteur externe (OSRM, Valhalla ou GraphHopper).
3. Stocke la polyligne dans `trips.route`.
4. Approvisionne le module matching avec cette polyligne.

Le point d'integration est volontairement etroit : matching consomme une
geometrie, il ne connait pas le moteur qui l'a produite. Changer de moteur ne
touche donc pas le matching.

## 11. Configuration et secrets

- Un seul `.env` a la racine, versionne sous le nom `.env.example`.
- `apps/api/app/core/config.py` est le seul point de lecture, via Pydantic
  Settings, avec valeurs par defaut de developpement.
- L'API refuse silencieusement de demarrer en production avec un `SECRET_KEY`
  de developpement : elle journalise une erreur explicite au demarrage.
- Aucune variable secrete n'est exposee au navigateur. Cote Next.js, seuls les
  prefixes `NEXT_PUBLIC_*` sont publics, et ils ne contiendront que des URL.

## 12. Deploiement

La topologie de production n'est pas figee. Le socle est concu pour :

- L'API et le web sont **sans etat** : ils se replicent horizontalement.
- Les sessions vivent en base, jamais en memoire.
- La seule donnee persistante est PostgreSQL, sauvegardee separement.
- Les migrations sont une etape de deploiement explicite, jamais un effet de
  bord du demarrage.

Ordre de demarrage : migrations, puis API, puis web.

## 13. Comment evoluer

| Besoin | Emplacement | Effet sur le reste du code |
|---|---|---|
| Nouveau module metier | `services/`, `models/`, `api/v1/endpoints/` | Aucun |
| Nouveau critere de matching | `matching/scoring.py` + matching.md | Aucun |
| Nouveau fournisseur de tuiles | `apps/web/src/lib/map/style.ts` | Aucun |
| Nouveau moteur d'itineraire | `app/services/routing/` | Aucun |
| Notifications asynchrones | `app/services/notifications/` + un worker | Aucun |

Cette stabilite des interfaces est l'objectif principal de la v0.1.0 :
permettre d'ajouter des modules sans rearbitrer l'architecture.
