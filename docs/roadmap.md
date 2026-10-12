# Feuille de route

## Jalon 0 : fondation technique - **termine**

Objectif : un socle executable, sans logique metier.

- [x] Monorepo : `apps/web`, `apps/api`, `packages`, `infrastructure`, `docs`, `scripts`
- [x] Frontend Next.js 16, App Router, TypeScript, Tailwind v4, composants de base
- [x] API FastAPI avec Pydantic v2, SQLAlchemy 2 async, Alembic configure
- [x] Sondes `/health` et `/health/ready`
- [x] PostgreSQL 16 + PostGIS dans Docker Compose, extensions initialisees
- [x] Dockerfile multi-etapes pour l'API et le web
- [x] `.env.example` sans secret, `.gitignore`, `.editorconfig`
- [x] Tests pytest, typecheck TypeScript, ESLint
- [x] Documentation d'architecture, de donnees, d'API, de matching et de securite

## Jalon 1 : modele de donnees

Objectif : un schema reellement importe en base.

1. Valider [database.md](./database.md).
2. Ecrire les modeles SQLAlchemy dans `app/models/`.
3. Generer la premiere migration Alembic, la relire ligne a ligne.
4. Verifier `alembic upgrade head` puis `alembic downgrade base` sur une base
   vide.
5. Alimenter en donnees de test representatives : zone de Paris, trajets
   realistes, profils de tous types.

**Critere de fin** : `alembic current` indique `head` et la base contient les
index spatiaux documentes.

## Jalon 2 : authentification et profils

Objectif : un utilisateur reel peut s'inscrire, se connecter et se deconnecter.

1. `users` : modeles, schemas, repository.
2. Hachage Argon2, jetons acces et renouvellement, table `refresh_tokens`.
3. Verification d'email et de telephone.
4. `driver_profiles`, `vehicles`.
5. Dependances d'autorisation `get_current_user`, `require_role`.
6. Tests : mot de passe, expiration, revocation, acces interdit.

**Critere de fin** : inscription, connexion, deconnexion et roles funerent
couverts par des tests.

## Jalon 3 : trajets

Objectif : un conducteur publie un trajet, un passager le voit.

1. CRUD `trips`, `trip_stops`, avec geometrie GeoJSON.
2. Validations : creneau coherent, places coherentes avec le vehicule.
3. Recurrence hebdomadaire (`recurrence_rule`).
4. Geocodage des adresses, avec cache `places`.
5. Interface de publication, responsive, avec carte MapLibre.
6. `GET /search/trips` : premiere version, filtres simples.

**Critere de fin** : un trajet publie depuis l'interface apparait dans une
recherche.

## Jalon 4 : matching

Objectif : le coeur du produit.

1. Generation de candidats en SQL, telle que decrite dans
   [matching.md](./matching.md).
2. Scoring et `reasons` explicables.
3. Integration du moteur d'itineraire (OSRM), donc `trips.route` reel.
4. Carte des trajets correspondants, avec trajet du conducteur en surbrillance.
5. Tests sur les scenarios du tableau de [matching.md](./matching.md).
6. Mesure de latence sur un jeu de donnees realiste.

**Critere de fin** : le cas "Sarcelles vers Paris / Saint-Denis vers Paris"
donne un resultat classe et justifie.

## Jalon 5 : reservations

Objectif : un passager reserve, le conducteur accepte.

1. `bookings` : demande, acceptation, refus, annulation.
2. Transaction avec verrou `FOR UPDATE` sur `trips`.
3. Notifications : e-mail d'abord, push ensuite.
4. Historique des trajets et annulation tardive avec penalite.

**Critere de fin** : deux reservations concurrentes sur la derniere place ne
peuvent pas reussir toutes les deux. Test de concurrence obligatoire.

## Jalon 6 : confiance et moderation

Objectif : rendre le service utilisable entre inconnus.

1. Messagerie liee a une reservation.
2. Evaluations bilaterales.
3. Signalements et blocage mutuel.
4. Verification d'identite par prestataire.
5. Tableau de bord d'administration.
6. Registre des traitements et privacy policy.

## Jalon 7 : exploitation

Objectif : tenir dans la vraie vie.

1. Fournisseur de tuiles identifie (ADR-007).
2. Sauvegardes et restauration testee.
3. Limitation de debit.
4. Observabilite : metriques, erreurs, traces.
5. `pip-audit` et `npm audit` en integration continue.
6. Validation juridique du fonctionnement du covoiturage.

## Priorites si le temps manque

L'ordre compte plus que le volume :

1. **Authentification** - sans elle, rien n'est testable en conditions
   reelles.
2. **Trajets** - sans trajet, pas de recherche.
3. **Matching** - c'est la proposition de valeur.
4. **Reservations** - c'est la transaction metier.
5. Le reste peut attendre.

Ce qui ne doit pas etre sacrifie : les tests de securite sur les acces, et le
test de concurrence sur les places.
