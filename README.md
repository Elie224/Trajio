# Trajio

> **Meme direction, partageons le trajet.**

Trajio est une application de covoiturage de proximite. Elle met en relation
des conducteurs qui ont des places libres et des passagers qui vont dans la
meme direction, meme lorsque les points de depart et d'arrivee different.

Ce depot contient **la fondation technique et les premiers modules produit** :
le socle est executable et verifie, avec une phase UI/UX complete et une
phase authentification/vehicules deja integrees. Les fonctionnalites restantes
continuent d'etre ajoutees par jalons, decrits dans
[docs/roadmap.md](./docs/roadmap.md).

## Prerequis

| Outil | Version | Verifie sur |
|---|---|---|
| Node.js | 20.9 ou plus | v25.2.1 |
| npm | 10 ou plus | 11.6.2 |
| Python | 3.11 ou plus | 3.13.9 |
| Docker Desktop | version recente | Compose v5.1.0 |
| PowerShell | 7 ou plus | 7.6.6 |
| Git | 2.30 ou plus | 2.56.0 |

## Installation

Depuis PowerShell, a la racine du projet :

```powershell
cd C:\Users\KOURO\Desktop\Trajio
.\scripts\setup.ps1
```

Le script est idempotent. Il cree `.env` a partir de `.env.example`, cree le
virtualenv Python dans `apps/api/.venv`, installe les dependances Python, puis
les dependances npm du frontend.

Generer une vraie cle secrete avant tout usage serieux :

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

## Demarrage

Trois terminaux, ou bien la pile complete via Docker.

### Option A : developpement (recommandé pour coder)

```powershell
# Terminal 1 - base de donnees
docker compose up -d db

# Terminal 2 - API
.\scripts\start-api.ps1 -Reload

# Terminal 3 - frontend
.\scripts\start-web.ps1
```

- Frontend : <http://localhost:3000>
- API : <http://127.0.0.1:8000>
- Documentation interactive : <http://127.0.0.1:8000/docs>

### Option B : la pile complete en conteneurs

```powershell
docker compose up -d --build
```

Meme URLs. Les migrations restent une etape explicite, jamais un effet de bord
du demarrage :

```powershell
docker compose exec api alembic upgrade head
```

### Arret

```powershell
docker compose down            # conserve la base
docker compose down -v         # supprime aussi le volume de donnees
```

## Tests et verifications

```powershell
# Tests de l'API
.\scripts\test-api.ps1

# Verification complete : tests, typecheck, lint, compose, /health
.\scripts\check.ps1
```

Ou manuellement :

```powershell
cd apps/api
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m ruff check .

cd ..\web
npm run typecheck
npm run lint
npm run build
```

Sondes disponibles :

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
Invoke-RestMethod http://127.0.0.1:8000/health/ready   # verifie aussi PostGIS
```

## Arborescence

```text
Trajio/
|-- apps/
|   |-- web/          Frontend Next.js (App Router, TypeScript, Tailwind v4)
|   +-- api/          API FastAPI (SQLAlchemy 2 async, Alembic, pytest)
|-- packages/        Elements partages a venir
|-- infrastructure/  Configuration d'infra (scripts SQL d'initialisation)
|-- docs/            Architecture, donnees, API, matching, securite, roadmap
|-- scripts/         Scripts PowerShell
|-- compose.yaml     Pile de developpement : db, api, web
|-- .env.example     Configuration d'exemple, sans secret
```

## Documentation

| Document | Contenu |
|---|---|
| [architecture.md](./docs/architecture.md) | Vue d'ensemble, choix techniques, regles de dependance |
| [database.md](./docs/database.md) | Modele relationnel cible, index, contraintes |
| [api-design.md](./docs/api-design.md) | Contrat REST, erreurs, autorisation, concurrence |
| [matching.md](./docs/matching.md) | Algorithme geospatial de correspondance |
| [security.md](./docs/security.md) | Secrets, RGPD, moderation, reglementation francaise |
| [roadmap.md](./docs/roadmap.md) | Jalons et criteres de fin |
| [decisions.md](./docs/decisions.md) | Journal ADR des choix d'architecture |

## Configuration

Tout passe par `.env` a la racine. Les valeurs par defaut conviennent au
developpement local.

| Variable | Defaut | Role |
|---|---|---|
| `APP_ENV` | `development` | Active ou non la documentation OpenAPI |
| `SECRET_KEY` | valeur de developpement | Signature des jetons. **A changer en production** |
| `CORS_ORIGINS` | `http://localhost:3000` | Origines autorisees, separees par des virgules |
| `POSTGRES_*` | `trajio` | Base de donnees |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000` | URL de l'API vue par le navigateur |
| `DEFAULT_SEARCH_RADIUS_M` | `5000` | Rayon de recherche par defaut |
| `MAX_DETOUR_RATIO` | `0.30` | Detour maximal, aligne sur la reglementation |

`.env` n'est jamais commit. Seul `.env.example` l'est.

Note : Next.js ne lit que les fichiers d'environnement places dans
`apps/web/`. Le script `start-web.ps1` reprend donc
`NEXT_PUBLIC_API_BASE_URL` depuis le `.env` racine, ce qui evite de dupliquer
la valeur. Pour un ajustement ponctuel en developpement, le fichier
`apps/web/.env.local` (ignore par Git) reste disponible.

## Migrations

Les revisions Alembic sont dans `apps/api/alembic/versions/`. Le schema cible
est decrit dans [database.md](./docs/database.md). Les migrations ne s'appliquent
jamais toutes seules au demarrage.

```powershell
cd apps/api

# appliquer jusqu'a la revision courante
.\.venv\Scripts\python.exe -m alembic upgrade head

# creer une nouvelle revision apres un changement de modele
.\.venv\Scripts\python.exe -m alembic revision --autogenerate -m "describe change"

# annuler la derniere revision
.\.venv\Scripts\python.exe -m alembic downgrade -1
```

Alembic lit la meme configuration que l'API : il n'y a pas d'URL a dupliquer.

## Stack technique

| Couche | Choix |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v4, MapLibre GL JS |
| Backend | Python, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, pytest |
| Donnees | PostgreSQL 16, PostGIS 3.5 |
| Infra | Docker, Docker Compose, Git |

## Prochaine etape

Auth, vehicules, trajets, recherche et reservations sont deja en place.
Les prochains jalons (messagerie, avis, moderation) sont dans
[roadmap.md](./docs/roadmap.md).
