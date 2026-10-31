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

L'inscription ne connecte jamais automatiquement l'utilisateur. Après création,
la page de connexion affiche une confirmation et demande de saisir les
identifiants. Si la vérification email est requise, elle invite d'abord à
confirmer l'adresse. Aucun identifiant n'est transmis à cette page.

Le profil affiche ses informations sur une colonne sur mobile, puis deux à
partir de 640 px. Les noms et emails longs reviennent à la ligne sans être
tronqués ni provoquer de défilement horizontal.

## Suggestions de lieux

Les champs de départ et d'arrivée de l'accueil, de la recherche et de la
publication proposent des lieux IGN/Géoplateforme après trois caractères et
300 ms sans frappe. Les flèches et Entrée permettent aussi de sélectionner
un lieu. La sélection renseigne les coordonnées de la carte ; modifier le
texte efface ces coordonnées pour éviter un emplacement périmé.

Les textes saisis sont transmis directement à `data.geopf.fr`, sans cookies
ni en-tête Referer. La priorité géographique utilise un point fixe à
Saint-Denis (Île-de-France), pas la position GPS de l'utilisateur. En cas
d'indisponibilité, un message explicite est affiché et la saisie manuelle
reste possible. L'historique local reste accessible quand le champ est vide.

## Identité visuelle

La palette utilise des fonds blanc cassé (`#F8F7F4`), du noir profond
(`#15151B`) pour les textes et le pied de page, du violet (`#5B21B6`)
pour les actions principales et du jaune (`#FACC15`) pour les accents.
Le jaune est associé à du texte noir, jamais blanc. Les états de succès et
d'erreur conservent leurs couleurs sémantiques verte et rouge.

Le logo fourni est conservé dans [public/trajio-logo.png](./public/trajio-logo.png).
Une version WebP avec les marges réduites, sans modification du dessin, est
utilisée dans l'en-tête uniquement. Le pied de page affiche le nom en texte.
Le favicon reprend la voiture et
le repère de localisation du même logo.

Les tokens partagés sont définis dans [globals.css](./src/app/globals.css).
Les cartes, champs, boutons, états actifs et tracés MapLibre reprennent ces
tokens ; le départ est violet et l'arrivée jaune avec un contour noir.

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
