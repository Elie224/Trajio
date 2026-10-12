# Journal des decisions d'architecture

Format ADR (Architecture Decision Record). Chaque entree est figee une fois
adoptee : une decision revue s'ajoute, elle ne se reecrit pas.

| ID | Titre | Statut |
|---|---|---|
| ADR-001 | Monolithe modulaire plutot que microservices | Adoptee |
| ADR-002 | Next.js 16 App Router | Adoptee |
| ADR-003 | Python 3.13, FastAPI, SQLAlchemy 2 async | Adoptee |
| ADR-004 | SRID 4326 et type geography | Adoptee |
| ADR-005 | Alembic, proprietaire exclusif du schema | Adoptee |
| ADR-006 | MapLibre GL JS plutot que Leaflet | Adoptee |
| ADR-007 | Tuiles OSM en dev, fournisseur dedie en production | Adoptee |
| ADR-008 | Matching geospatial classique, sans IA | Adoptee |
| ADR-009 | Argon2 et jetons JWT | Adoptee |
| ADR-010 | Identifiants UUID | Adoptee |
| ADR-011 | Monorepo sans npm workspaces pour l'instant | Adoptee |
| ADR-012 | Polices systeme, sans webfont | Adoptee |

---

## ADR-001 : Monolithe modulaire plutot que microservices

**Statut** : Adoptee

**Contexte** : Le cahier des charges imposait de preferer un monolithe
modulaire. Il faut en documenter la consequence reelle.

**Decision** : Un seul backend FastAPI, deploye comme une seule unite. Le
decoupage est logique, pas physique : chaque module metier possede son
controleur, son service et ses modeles dans des dossiers distincts, et ne
communique avec les autres qu'a travers ses interfaces publiques.

**Consequences** :

- Un deploiement, un jeu de tests, une seule base : complexite operationnelle
  minimale, ce qui convient a une equipe de depart.
- Pas de transaction distribuee : confirmer une reservation et decrementer les
  places disponibles tient dans une seule transaction SQL.
- Le couplage reste un risque. Il est contenu par une regle explicite : un
  controleur n'accede jamais directement a un modele, il passe par un service.
- Si un module devient un goulot d'etirement, il peut etre extrait en service
  sans avoir anticipe la distribution.

---

## ADR-002 : Next.js 16 App Router

**Statut** : Adoptee

**Contexte** : Deux generations coexistent dans Next.js : le routeur Pages et
l'App Router. Les faire cohabiter dans un meme projet|source de confusion.

**Decision** : App Router uniquement, avec Server Components par defaut et
components Client ("use client") limites au strict necessaire - ici
`ApiStatusCard`, qui realise un appel navigateur avec `useEffect`.

**Consequences** :

- Le JavaScript envoye au navigateur est reduit au minimum.
- Les routes sont decouplees de l'URL de l'API : renommer un endpoint REST ne
  casse pas le frontend.
- Attention au comportement `cacheComponents` et aux frontieres Suspense :
  toute lecture de donnees dynamique cote serveur doit en etre encapsulee.

---

## ADR-003 : Python 3.13, FastAPI, SQLAlchemy 2 async

**Statut** : Adoptee

**Contexte** : L'environnement de developpement fournit Python 3.13.9. Le
projet demande FastAPI, Pydantic, SQLAlchemy et Alembic.

**Decision** : Cible `requires-python = ">=3.11"`, image Docker
`python:3.13-slim`, SQLAlchemy 2 en mode asyncio avec `asyncpg` a l'execution
et `psycopg` pour les migrations.

**Consequences** :

- La majorite du code est non bloquant, y compris les requetes PostGIS.
- `asyncpg` ne supporte pas certaines fonctions serveur proprietaires ; le
  repli vers `psycopg` en mode synchrone est documente pour Alembic.
- L'image Docker suit la meme version mineure que le poste de developpement :
  moins de divergences entre local et conteneur.

---

## ADR-004 : SRID 4326 et type geography

**Statut** : Adoptee

**Contexte** : PostGIS distingue `geometry` (coordonnees en unites de
reference, donc en degres) de `geography` (geodesie spherique, donc en
metres). Le module de matching raisonne en metres.

**Decision** : Toutes les colonnes spatiales sont en
`geography(Point, 4326)`, sauf les itineraires en
`geography(LineString, 4326)`. Aucune projection locale n'est stockee.

**Consequences** :

- `ST_DWithin` et `ST_Distance` renvoient des metres : le seuil de recherche
  se lit directement dans la configuration.
- `ST_DWithin` exploite un index GiST et reste donc rapide meme avec des
  millions de trajets.
- Si un calcul fin exige une projection locale (Lambert 93), elle se fera dans
  la requete, pas dans le stockage.

---

## ADR-005 : Alembic, proprietaire exclusif du schema

**Statut** : Adoptee

**Contexte** : Deux moyens classiques de creer le schema : `create_all` au
demarrage, ou des migrations versionnees.

**Decision** : Alembic est le seul autorise a modifier le schema.
L'application n'appelle jamais `create_all` et n'execute aucune migration au
demarrage. Alembic lit l'URL de connexion depuis `app.core.config`, comme
l'application.

**Consequences** :

- Le schema est reproductible et auditable, et peut etre lu hors production.
- Un deploiement qui oublie l'etape de migration echoue tot et visiblement,
  plutot que de demarrer sur un schema incoherent.
- Le developpeur doit penser a lancer `alembic upgrade head`.

---

## ADR-006 : MapLibre GL JS plutot que Leaflet

**Statut** : Adoptee

**Contexte** : Leaflet reste tres utilise, mais son modele DOM par tuile
penalise les couches geometriques nombreuses. Trajio doit dessiner des
polylignes d'itineraire, des points de rendez-vous et des clusters de
passagers.

**Decision** : MapLibre GL JS, avec le style centralise dans
`apps/web/src/lib/map/style.ts`.

**Consequences** :

- Rendu WebGL : des centaines de trajets s'affichent sans degrader le
  navigateur.
- Support natif des sources vectorielles, utiles pour un rendu plus propre.
- Le composant de carte ne doit etre instancie que cote client. Il n'existe pas
  encore : ce point est a respecter a sa creation.

---

## ADR-007 : Tuiles OSM en dev, fournisseur dedie en production

**Statut** : Adoptee

**Contexte** : Les tuiles publiques d'OpenStreetMap sont gratuites mais
soumises a une politique d'usage : pas d'usage commercial intensif,
identification obligatoire, pas de saturation.

**Decision** : Tuiles publiques en developpement local uniquement. En
production, passer a un fournisseur dedie (tile.openstreetmap.fr pour la France,
ou un hebergeur de tuiles), en modifiant la seule constante
`OSM_RASTER_STYLE`.

**Consequences** :

- Aucune cle d'API n'est necessaire pour developper, et rien n'est paye.
- Le basculement en production tient en une ligne, car le style est isole.
- L'attribution OpenStreetMap doit rester visible sur la carte.

---

## ADR-008 : Matching geospatial classique, sans IA

**Statut** : Adoptee

**Contexte** : Le cahier des charges interdit d'introduire un LLM ou une IA
generative sans besoin reel, et demande des algorithmes geospatiaux classiques
pour la premiere version.

**Decision** : Generation de candidats par index spatial PostGIS, puis scoring
ponderable et deterministe. Aucune inference de modele.

**Consequences** :

- Resultat explicable : chaque correspondance peut justifier son score aupres
  de l'utilisateur, ce qui est un fort argument de confiance pour un service de
  transport entre particuliers.
- Cout marginal de calcul et latence predictable.
- Les criteres sont des poids lisibles, ajustables et testables un par un.
- Si un modele devenait utile, il pourrait scorer des candidats deja
  selectionnes par la geometrie, sans remplacer la couche de generation.

---

## ADR-009 : Argon2 et jetons JWT

**Statut** : Adoptee

**Contexte** : L'authentification doit rester simple pour un backend modulaire,
sans introduire de service externe.

**Decision** : Mots de passe haches en Argon2id via `pwdlib`. Session par
jeton JWT : jeton d'acces court (60 min) et jeton de renouvellement long
(30 jours) conserve en base, afin de pouvoir le revoquer.

**Consequences** :

- Un acces vole expire vite ; la deconnexion reste immediate grace a la
  revocation du jeton de renouvellement.
- Aucune session en memoire : l'API reste sans etat et replicable.
- Argon2 etant plus lent que bcrypt, ses parametres devront etre mesures avant
  la mise en production.

---

## ADR-010 : Identifiants UUID

**Statut** : Adoptee

**Contexte** : L'option la plus economique en PostgreSQL reste `bigserial`.
Les identifiants sequentiels sont devoilables et ne sont pas uniques a la
creation, ce qui complique les tests.

**Decision** : UUID comme cle primaire de toutes les tables metier.

**Consequences** :

- Un identifiant ne revele ni volume ni ordre chronologique.
- Generation possible cote application, ce qui evite un aller-retour en base.
- Index B-tree plus volumineux et fragmentation en insertion. Acceptable a
  l'echelle attendue ; reevaluer si `bookings` ou `messages` passent le
  million de lignes.

---

## ADR-011 : Monorepo sans npm workspaces pour l'instant

**Statut** : Adoptee

**Contexte** : Un seul paquet JavaScript existe aujourd'hui (`apps/web`).
Activer les workspaces npm forcerait une reinstallation et une reorganisation de
`node_modules`, sans benefice immediat.

**Decision** : Pas de champ `workspaces` dans le `package.json` racine. Les
scripts racine deleguent explicitement via `npm --prefix apps/web`. Le dossier
`packages/` est reserve a l'avenir.

**Consequences** :

- Aucun risque de casser l'installation deja verifiee.
- Activation reversible plus tard, si un deuxieme paquet apparait, sans impact
  sur le code applicatif.

---

## ADR-012 : Polices systeme, sans webfont

**Statut** : Adoptee

**Contexte** : Le gabarit Next.js charge Geist depuis Google Fonts, ce qui
introduit une requete vers un tiers - donc une donnee transmise a un tiers, a
declarer au titre du RGPD - et une dependance reseau au moment du build.

**Decision** : Aucune police web chargee. La pile systeme est definie dans
`globals.css` via `--font-sans`.

**Consequences** :

- Build entierement hors ligne, donc reproductible et rapide.
- Aucune requete vers un tiers au chargement : rien a declarer au titre de la
  mesure d'audience.
- Aspect typographique un peu moins marque qu'avec une police personnalisee.
  Acceptable pour une v0, et trivial a inverser plus tard.
