# Modele de donnees

> **Statut : specification, non implementee.** Aucune migration Alembic n'existe
> encore. Ce document doit etre valide avant de generer le premier schema.

## 1. Conventions

| Sujet | Choix | Raison |
|---|---|---|
| Cle primaire | `uuid` | Ne revele ni volume ni ordre chronologique (ADR-010) |
| Horodatage | `timestamptz`, UTC en base | Le fuseau est une decision d'affichage, pas de stockage |
| Geometrie | `geography(Point, 4326)` | Distances en metres, index GiST (ADR-004) |
| Itineraire | `geography(LineString, 4326)` | Nullable tant que le moteur d'itineraire n'est pas branche |
| Suppression | `deleted_at timestamptz NULL` | Soft delete, pour la conservation et l'audit |
| Argent | `amount_cents integer` | Aucun flottant pour la monnaie ; 150 vaut 1,50 EUR |
| Enum | Type `ENUM` PostgreSQL | Valeurs fermees, verifiees par la base |
| Nommage | Singulier, `snake_case` | `trip`/`trips`, `driver_id`/`driver_profiles` |
| Horodatage auto | `created_at`/`updated_at` via `server_default` | Coherence sans logique applicative |

Toutes les contraintes sont nommees explicitement, grace a la convention
definie dans `apps/api/app/db/base.py` : une migration peut alors etre annulee
sans deviner les noms.

## 2. Diagramme de dependances

    users
      |  1:1
      +--> driver_profiles
      |        |  1:N
      |        +--> vehicles
      |                 |  1:N
      |                 +--> trips
      |                        |  1:N
      |                        +--> trip_stops
      |                        |
      |                        +<--> bookings
      |                                 |
      +<--> conversation_participants   |
                 |                       |
                 +--> conversations <----+
                 |        |  1:N
                 |        +--> messages
                 |
                 +--> notifications
                 +--> reviews
                 +--> reports

## 3. `users`

Compte unique, quel que soit le role. Un conducteur est aussi un `user` :
il peut etre passager sur le trajet d'un autre.

| Colonne | Type | Contraintes | Description |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `email` | `citext` | NOT NULL, UNIQUE | Citext : recherche insensible a la casse |
| `password_hash` | `text` | NOT NULL | Hash Argon2id |
| `phone` | `text` | UNIQUE, NULL | Nullable : contact par email au lancement |
| `first_name` | `text` | NOT NULL | |
| `last_name` | `text` | NOT NULL | |
| `role` | `user_role` | NOT NULL, DEFAULT `passenger` | `passenger`, `driver`, `admin` |
| `status` | `user_status` | NOT NULL, DEFAULT `pending` | `pending`, `active`, `suspended`, `banned` |
| `email_verified_at` | `timestamptz` | NULL | NULL tant que non verifie |
| `phone_verified_at` | `timestamptz` | NULL | |
| `id_document_status` | `verification_status` | NOT NULL, DEFAULT `none` | `none`, `pending`, `verified`, `rejected` |
| `last_login_at` | `timestamptz` | NULL | |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT `now()` | |
| `deleted_at` | `timestamptz` | NULL | |

**Index**

- `uq_users_email` (unique) sur `email`
- `uq_users_phone` (unique) partiel `WHERE phone IS NOT NULL`
- `ix_users_status_role` sur `(status, role)`

**Contraintes applicatives**

- `status = 'active'` est requis pour publier un trajet ou reserver.
- Un compte `banned` ne peut plus se connecter ni reserver.
- La suppression est logique : trajets et reservations passes sont conserves.

## 4. `driver_profiles`

Extension 1:1 d'un `user` de role `driver`. Ne contient aucune donnee
generaliste : ce qui vaut pour tous reste dans `users`.

| Colonne | Type | Contraintes | Description |
|---|---|---|---|
| `user_id` | `uuid` | PK, FK `users(id)` ON DELETE CASCADE | |
| `bio` | `text` | NULL, CHECK longueur <= 500 | |
| `home_point` | `geography(Point,4326)` | NULL | Point d'accueil par defaut ; accelere la recherche |
| `default_radius_m` | `integer` | NOT NULL, DEFAULT 5000 | Rayon de detour que le conducteur accepte |
| `max_detour_minutes` | `integer` | NOT NULL, DEFAULT 20 | |
| `rating_average` | `numeric(3,2)` | NOT NULL, DEFAULT 0, CHECK 0..5 | Denormalise pour eviter un agregat a chaque lecture |
| `rating_count` | `integer` | NOT NULL, DEFAULT 0 | |
| `identity_verified_at` | `timestamptz` | NULL | Piece d'identite verifiee |
| `license_verified_at` | `timestamptz` | NULL | Permis verifie |
| `created_at`/`updated_at` | `timestamptz` | NOT NULL | |

**Index** : GiST sur `home_point`.

## 5. `vehicles`

| Colonne | Type | Contraintes | Description |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `owner_id` | `uuid` | NOT NULL, FK `driver_profiles(user_id)` ON DELETE CASCADE | |
| `brand` | `text` | NOT NULL | |
| `model` | `text` | NOT NULL | |
| `color` | `text` | NULL | |
| `plate` | `text` | NOT NULL | Plaque d'immatriculation, format francais |
| `seats_total` | `smallint` | NOT NULL, CHECK 2..9 | Places assises, conducteur exclu |
| `year` | `smallint` | NULL, CHECK 1990..2100 | |
| `is_primary` | `boolean` | NOT NULL, DEFAULT false | Un seul vehicule principal par conducteur |
| `is_active` | `boolean` | NOT NULL, DEFAULT true | |
| `photo_url` | `text` | NULL | |
| `created_at`/`updated_at` | `timestamptz` | NOT NULL | |

**Contraintes**

- Index unique partiel : un seul `is_primary = true` par `owner_id`.
- `seats_total` est la source de verite ; `trips.seats_available` ne peut
  jamais le depasser.

## 6. `trips`

Le coeur du modele : un trajet publie par un conducteur, pour un itineraire et
une plage horaire.

| Colonne | Type | Contraintes | Description |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `driver_id` | `uuid` | NOT NULL, FK `driver_profiles(user_id)` | |
| `vehicle_id` | `uuid` | NOT NULL, FK `vehicles(id)` | |
| `origin_point` | `geography(Point,4326)` | NOT NULL | Depart |
| `origin_label` | `text` | NOT NULL | Adresse lisible, denormalisee |
| `destination_point` | `geography(Point,4326)` | NOT NULL | Arrivee |
| `destination_label` | `text` | NOT NULL | |
| `route` | `geography(LineString,4326)` | NULL | Rempli par le moteur d'itineraire |
| `route_source` | `text` | NULL | `osm`, `osrm`, `manual` : provenance, pour la reproductibilite |
| `route_distance_m` | `integer` | NULL | Longueur du trajet, en metres |
| `departure_time` | `timestamptz` | NOT NULL | |
| `arrival_time` | `timestamptz` | NOT NULL, CHECK > `departure_time` | Estimation a la creation |
| `seats_total` | `smallint` | NOT NULL | Recopie du vehicule a la creation, pour l'historique |
| `seats_available` | `smallint` | NOT NULL, CHECK >= 0 | Source de verite de la disponibilite |
| `contribution_cents` | `integer` | NOT NULL, DEFAULT 0, CHECK >= 0 | Participation du passager, en centimes |
| `contribution_mode` | `contribution_mode` | NOT NULL, DEFAULT `free` | `free`, `per_seat` |
| `max_detour_ratio` | `numeric(4,3)` | NOT NULL, DEFAULT 0.30 | Detour max accepte sur CE trajet |
| `status` | `trip_status` | NOT NULL, DEFAULT `scheduled` | `draft`, `scheduled`, `ongoing`, `completed`, `cancelled` |
| `is_recurring` | `boolean` | NOT NULL, DEFAULT false | |
| `recurrence_rule` | `text` | NULL | Regle iCalendar : `FREQ=WEEKLY;BYDAY=MO,TU` |
| `recurrence_until` | `date` | NULL | |
| `parent_trip_id` | `uuid` | NULL, FK `trips(id)` | Renseigne sur les occurrences generees |
| `notes` | `text` | NULL, CHECK <= 500 | |
| `created_at`/`updated_at`/`deleted_at` | `timestamptz` | | |

**Index**

- GiST sur `origin_point`, `destination_point` et `route`.
- `ix_trips_driver_departure` sur `(driver_id, departure_time DESC)` :
  liste des trajets d'un conducteur.
- `ix_trips_open_departure` sur `(departure_time)` partiel
  `WHERE status = 'scheduled' AND deleted_at IS NULL` : chemin critique de la
  recherche, volontairement etroit.
- `ix_trips_seats` sur `(seats_available)` partiel `WHERE status =
  'scheduled'` : filtre d'eligibilite.

**Invariants applicatifs** (contraintes cross-tables, verifiees en service)

- `seats_available <= seats_total` et `seats_total <= vehicles.seats_total`.
- Une reservation acceptee decrement `seats_available` dans la meme
  transaction que l'insertion, avec `SELECT ... FOR UPDATE` sur la ligne
  `trips` pour serialiser les demandes concurrentes.

## 7. `trip_stops`

Arrets intermediaires et points de rendez-vous.

| Colonne | Type | Contraintes | Description |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `trip_id` | `uuid` | NOT NULL, FK `trips(id)` ON DELETE CASCADE | |
| `sequence` | `smallint` | NOT NULL | Ordre chronologique, a partir de 0 |
| `stop_type` | `stop_type` | NOT NULL | `pickup`, `dropoff`, `waypoint` |
| `point` | `geography(Point,4326)` | NOT NULL | |
| `label` | `text` | NOT NULL | |
| `offset_minutes` | `smallint` | NULL | Decalage par rapport au depart |

**Contraintes** : unique `(trip_id, sequence)` ; GiST sur `point`.

## 8. `bookings`

| Colonne | Type | Contraintes | Description |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `trip_id` | `uuid` | NOT NULL, FK `trips(id)` | |
| `passenger_id` | `uuid` | NOT NULL, FK `users(id)` | |
| `seats` | `smallint` | NOT NULL, DEFAULT 1, CHECK 1..8 | |
| `status` | `booking_status` | NOT NULL, DEFAULT `pending` | `pending`, `accepted`, `declined`, `cancelled`, `completed`, `no_show` |
| `pickup_point` | `geography(Point,4326)` | NULL | Point de rendez-vous negocie, different du depart du trajet |
| `pickup_label` | `text` | NULL | |
| `dropoff_point` | `geography(Point,4326)` | NULL | |
| `dropoff_label` | `text` | NULL | |
| `amount_cents` | `integer` | NOT NULL, DEFAULT 0 | Recopie figee du prix au moment de la demande |
| `message` | `text` | NULL, CHECK <= 500 | Message joint a la demande |
| `requested_at` | `timestamptz` | NOT NULL, DEFAULT `now()` | |
| `responded_at` | `timestamptz` | NULL | |
| `cancelled_by` | `uuid` | NULL, FK `users(id)` | Qui a annule |
| `cancel_reason` | `text` | NULL | |
| `created_at`/`updated_at` | `timestamptz` | | |

**Index**

- `ix_bookings_trip_status` sur `(trip_id, status)` : demandes a traiter.
- `ix_bookings_passenger` sur `(passenger_id, created_at DESC)`.
- GiST sur `pickup_point` et `dropoff_point`.

**Contraintes**

- Un passager ne peut avoir qu'une reservation active par trajet : index unique
  partiel sur `(trip_id, passenger_id)` limite aux statuts actifs.
- CHECK `passenger_id <> trips.driver_id` : on ne reserve pas son propre trajet.

## 9. `conversations` et `conversation_participants`

| `conversations` | Type | Contraintes |
|---|---|---|
| `id` | `uuid` | PK |
| `trip_id` | `uuid` | NULL, FK `trips(id)` |
| `booking_id` | `uuid` | NULL, FK `bookings(id)` |
| `created_at`/`updated_at` | `timestamptz` | NOT NULL |

| `conversation_participants` | Type | Contraintes |
|---|---|---|
| `conversation_id` | `uuid` | PK, FK ON DELETE CASCADE |
| `user_id` | `uuid` | PK, FK `users(id)` ON DELETE CASCADE |
| `last_read_at` | `timestamptz` | NULL, par participant |

Une table de jonction plutot qu'une colonne `participants`, pour porter un
`last_read_at` different par personne. Index unique sur
`(trip_id, booking_id)` pour eviter les doublons.

## 10. `messages`

| Colonne | Type | Contraintes | Description |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `conversation_id` | `uuid` | NOT NULL, FK ON DELETE CASCADE | |
| `sender_id` | `uuid` | NOT NULL, FK `users(id)` | |
| `body` | `text` | NOT NULL, CHECK 1..2000 | |
| `attachment_url` | `text` | NULL | |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT `now()` | |
| `deleted_at` | `timestamptz` | NULL | |

**Index** : `(conversation_id, created_at)` pour le defilement de l'historique.

## 11. `reviews`

| Colonne | Type | Contraintes | Description |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `booking_id` | `uuid` | NOT NULL, FK `bookings(id)` | Lien avec le trajet evalue |
| `trip_id` | `uuid` | NOT NULL, FK `trips(id)` | Denormalise pour lire les avis d'un trajet |
| `author_id` | `uuid` | NOT NULL, FK `users(id)` | |
| `subject_id` | `uuid` | NOT NULL, FK `users(id)` | La personne notee |
| `rating` | `smallint` | NOT NULL, CHECK 1..5 | |
| `comment` | `text` | NULL, CHECK <= 500 | |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT `now()` | |

**Contraintes** : unique `(booking_id, author_id)`, donc un seul avis par
personne et par trajet. CHECK `author_id <> subject_id` : pas d'auto-avis.

## 12. `notifications`

| Colonne | Type | Contraintes | Description |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `user_id` | `uuid` | NOT NULL, FK `users(id)` ON DELETE CASCADE | |
| `type` | `notification_type` | NOT NULL | `booking_request`, `booking_accepted`, ... |
| `payload` | `jsonb` | NOT NULL, DEFAULT `'{}'` | Donnees de rendu, structure libre |
| `read_at` | `timestamptz` | NULL | |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT `now()` | |

**Index** : `(user_id, created_at DESC)` partiel `WHERE read_at IS NULL`, la
liste des notifications non lues. `payload` en `jsonb` permet d'ajouter un
type sans migration.

## 13. `reports`

| Colonne | Type | Contraintes | Description |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `reporter_id` | `uuid` | NOT NULL, FK `users(id)` | |
| `reported_user_id` | `uuid` | NOT NULL, FK `users(id)` | |
| `booking_id` | `uuid` | NULL, FK `bookings(id)` | Contexte eventuel |
| `reason` | `report_reason` | NOT NULL | `safety`, `harassment`, `no_show`, `vehicle`, `payment`, `other` |
| `details` | `text` | NULL, CHECK <= 2000 | |
| `status` | `report_status` | NOT NULL, DEFAULT `open` | `open`, `reviewing`, `resolved`, `dismissed` |
| `resolved_by` | `uuid` | NULL, FK `users(id)` | Moderateur |
| `resolution` | `text` | NULL | |
| `created_at`/`updated_at` | `timestamptz` | | |

**Contraintes** : unique partiel `(reporter_id, reported_user_id, reason)`
limite a `status = 'open'` - on ne signale pas deux fois le meme motif.

## 14. Tables ajoutees hors liste initiale

Trois tables ne figuraient pas dans la demande initiale. Elles ne sont pas
optionnelles :

| Table | Justification |
|---|---|
| `refresh_tokens` | Sans elle, `/logout` est un no-op : un jeton vole reste valide jusqu'a expiration (ADR-009). Stocke le hash, jamais le jeton. |
| `places` | Carnet d'adresses et cache de geocodage, pour eviter de ressaisir une adresse a chaque publication. |
| `conversation_participants` | Porte `last_read_at` par personne, ce qu'une colonne unique ne permet pas. |

## 15. Strategie d'indexation

| Requete | Index |
|---|---|
| Conducteur : mes trajets a venir | `(driver_id, departure_time DESC)` |
| Passager : trajets correspondants | GiST `origin_point`, puis GiST `destination_point` |
| Filtre d'eligibilite | `(seats_available)` partiel sur `status='scheduled'` |
| Demandes a traiter | `(trip_id, status)` sur `bookings` |
| Boite de reception | `(user_id, created_at DESC)` partiel sur non-lues |

L'ordre des colonnes suit toujours le principe "egalite, puis tri", pour que le
tri puisse lui-meme servir d'index.

## 16. Partitionnement et volumetrie

Aucune partition n'est prevue au depart. Reevaluation a partir de :

- `trips` : 10 millions de lignes, ou quand `ix_trips_open_departure`
  devient la source d'IO dominante.
- `messages` : 50 millions de lignes ; partitionnement par mois sur
  `created_at`.
- `notifications` : purge automatique au-dela de 90 jours.

## 17. Donnees personnelles et RGPD

Les regles completes sont dans [security.md](./security.md). Cote schema :

- `deleted_at` permet un effacement logique, puis une anonymisation asynchrone
  pour les comptes sans obligation de conservation.
- `payload jsonb` des notifications ne doit contenir aucune donnee sensible :
  il est lisible par un utilisateur authentifie.
- `pickup_point` est une donnee de localisation : jamais dans un payload public.

## 18. Prochaines etapes

1. Relire et valider ce document.
2. Ecrire les modeles SQLAlchemy dans `apps/api/app/models/`.
3. Generer la premiere revision :
   `alembic revision --autogenerate -m "initial schema"`.
4. Verifier le SQL produit sur une base vide avant de committer.
