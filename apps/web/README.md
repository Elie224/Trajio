## Trajio Web — Phase 1 UI/UX

Frontend Next.js du projet Trajio.

Cette phase livre une interface utilisateur orientée covoiturage :

- navigation produit (Accueil, Recherche, Proposer, Mes trajets, Messages),
- landing page avec formulaire de recherche visible immédiatement,
- page de recherche desktop/mobile avec carte MapLibre et résultats réels publiés depuis l'API,
- pages d'authentification et espace compte réellement connectés au backend,
- publication de trajet connectée à l'API (`/api/v1/trips`) avec prévisualisation carte,
- pages messagerie prêtes pour la suite métier.

Les flux métier non encore exposés côté API ne sont pas simulés : les actions concernées restent explicitement désactivées.

## Démarrage

Depuis [apps/web/](C:/Users/KOURO/Desktop/Trajio/apps/web/) :

```bash
npm run dev
```

Ou depuis la racine du dépôt :

```powershell
.\scripts\start-web.ps1 -Port 3006
```

Le frontend lit `NEXT_PUBLIC_API_BASE_URL` dans [apps/web/.env.local](./.env.local) et vérifie l'API via `/health`.

## Routes principales

- `/` : page d'accueil avec Hero, recherche, carte et sections produit
- `/search` : espace de recherche avec résultats + carte interactive
- `/offer` : publication de trajet connectée (`POST /api/v1/trips`)
- `/login` et `/signup` : inscription/connexion connectées à `/api/v1/auth/*`
- `/trips` : espace compte connecté (`/auth/me`, `/vehicles`, `/trips/mine`)
- `/messages` : section utilisateur (liaison backend prévue phase 6)

## Validation

Depuis [apps/web/](C:/Users/KOURO/Desktop/Trajio/apps/web/) :

```bash
npm run typecheck
npm run lint
```
