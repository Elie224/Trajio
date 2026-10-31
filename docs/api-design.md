# Conception de l'API

> **Statut : partiellement implémenté.** Les modules `/health`, `/auth` et
> `/vehicles` sont implémentés. Les autres sections restent le contrat cible
> des prochains modules.

## 1. Principes

| Sujet | Regle | Raison |
|---|---|---|
| Style | REST, ressources au pluriel | Standard, outillage interoperationnel |
| Base | `/api/v1` | Un changement de contrat peut coexister avec l'ancien |
| Serialisation | JSON UTF-8 | |
| Noms de champs | `snake_case` | Aligne sur SQL et Python ; le frontend convertit si besoin |
| Horodatage | ISO 8601 avec suffixe UTC | `2026-04-17T07:30:00Z` |
| Montant | `amount_cents` entier | Aucun flottant pour la monnaie |
| Geometrie | GeoJSON `{type, coordinates}` | Lisible par MapLibre sans conversion |
| Pagination | Curseur opaque, jamais d'offset | Un offset se degrade vite et bouge quand on insere |

## 2. Exemple de contrat

```http
POST /api/v1/trips
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "vehicle_id": "0b4c9e3a-...",
  "origin":      { "type": "Point", "coordinates": [2.3876, 48.9734] },
  "origin_label": "Gare de Sarcelles",
  "destination": { "type": "Point", "coordinates": [2.3522, 48.8566] },
  "destination_label": "Gare du Nord, Paris",
  "departure_time": "2026-04-17T07:30:00Z",
  "arrival_time":   "2026-04-17T08:05:00Z",
  "contribution_cents": 150,
  "max_detour_ratio": 0.3
}
```

```http
HTTP/1.1 201 Created
Location: /api/v1/trips/3f2a...

{
  "id": "3f2a...",
  "status": "scheduled",
  "seats_available": 3,
  "route": null,
  "route_source": null
}
```

`route` vaut `null` tant que le moteur d'itineraire n'a pas ete branche. Ce
n'est pas une erreur : le client sait qu'il doit dessiner une ligne droite
provisoire.

## 3. Format d'erreur

Une seule structure, toujours. Un client peut donc afficher un message sans
connaitre l'endpoint.

```json
{
  "error": {
    "code": "trip_seats_unavailable",
    "message": "Il ne reste plus de place sur ce trajet.",
    "details": { "seats_available": 0, "seats_requested": 1 },
    "request_id": "01J9Z8..."
  }
}
```

- `code` : identifiant stable, destine au code. Ne jamais traduire.
- `message` : destine a l'utilisateur, en francais.
- `request_id` : correlatable avec les journaux serveur.

Les exceptions du domaine vivent dans `app/core/errors.py` et sont converties
en reponse HTTP par un gestionnaire unique. Un controleur n'attrape jamais une
exception metier lui-meme.

## 4. Codes HTTP

| Code | Usage |
|---|---|
| 200 / 201 | Lecture, creation |
| 204 | Suppression ou action sans retour |
| 400 / 422 | Requete mal formee, contrainte de metier violee |
| 401 | Absent ou jeton invalide |
| 403 | Authentifie mais pas autorise |
| 404 | Ressource inexistante **ou masquee** a l'utilisateur non concerne |
| 409 | Conflit d'etat : deja reserve, places epuisees |
| 429 | Quota depasse |

Le 404 est preferable au 403 pour une ressource privee dont l'existence doit
rester privee : ne pas reveler qu'une conversation existe a un tiers.

## 5. Authentification

```http
Authorization: Bearer <access_token>
```

- Jeton d'acces JWT, 60 minutes, conserve en memoire par le client.
- Jeton de renouvellement, 30 jours, stocke en base sous forme de hash, donc
  revocable.
- `POST /auth/logout` invalide le jeton de renouvellement.
- Aucune information de session cote serveur : l'API reste sans etat et
  replicable.

## 6. Autorisations

Chaque operation porte sur la propriete de la ressource. La verification est
cote serveur, jamais dans le client.

| Ressource | Qui peut lire | Qui peut ecrire |
|---|---|---|
| Profil public | Tout utilisateur connecte | Le proprietaire |
| Coordonnees exactes de rendez-vous | Le conducteur et le passager reserves | - |
| Trajet | Tout | Son conducteur |
| Reservation | Les deux parties | Le passager (demande, annulation), le conducteur (acceptation, refus) |
| Conversation | Les participants | Les participants |
| Avis | Public | Son auteur, dans les 14 jours |

Chaque regle doit avoir un cas de test qui tente l'acces interdit et attend un
echec.

## 7. Concurrence sur les reservations

Deux passagers peuvent accepter la derniere place au meme instant. La sequence
doit etre atomique.

```sql
BEGIN;
SELECT seats_available FROM trips WHERE id = :trip_id FOR UPDATE;
-- verifier places, statut du compte, creneau horaire
INSERT INTO bookings (...) VALUES (...);
UPDATE trips SET seats_available = seats_available - :seats WHERE id = :trip_id;
COMMIT;
```

Le verrou `FOR UPDATE` serialise les demandes concurrentes sur la ligne du
trajet. La verification des places et l'ecriture de la reservation sont dans la
meme transaction : soit les deux reussissent, soit aucune.

## 8. Endpoints prevus

| Module | Prefixe | Endpoints principaux |
|---|---|---|
| Sante | `/health` | `/health`, `/health/ready` **implémente** |
| Authentification | `/auth` | `register`, `login`, `refresh`, `logout`, `verify-email`, `forgot-password`, `reset-password`, `me` **implémente** |
| Utilisateurs | `/users` | `me`, profil, `drivers/{id}` |
| Vehicules | `/vehicles` | CRUD, definir le vehicule principal **implémente** |
| Trajets | `/trips` | `POST /trips`, `GET /trips/mine`, `PATCH /trips/{id}`, `POST /trips/{id}/cancel` **implémente** |
| Recherche | `/search` | `GET /search/trips` avec filtres + score de matching explicable (`match_score`, `match_reasons`) **implémente** |
| Reservations | `/bookings` | `POST /bookings`, `GET /bookings/mine`, `GET /bookings/incoming`, `{id}/accept`, `{id}/decline`, `{id}/cancel` **implémente** |
| Messages | `/messages` | conversations, `{id}/messages`, `{id}/read` |
| Notifications | `/notifications` | liste, `{id}/read` |
| Evaluations | `/reviews` | liste publique, creation post-trajet |
| Signalements | `/reports` | creation, suivi par le signaleur |
| Administration | `/admin` | `GET /stats`, `GET /users`, `GET /reports`, `PATCH /reports/{id}`, `PATCH /users/{id}/status`, `PATCH /users/{id}/identity` **implémente** |

Chaque module enregistre son routeur dans `app/api/v1/router.py`. Les
controleurs restent sans logique : ils deleguent a `app/services/`.

La recherche textuelle de lieux ignore la casse et les séparateurs :
`saint denis` correspond à `Saint-Denis`. Lorsqu'un point de départ ou
d'arrivée est fourni, le filtre textuel correspondant est remplacé par le
matching géographique ; le libellé complet du géocodeur ne doit pas exclure
un trajet proche. La date, les places et le statut restent filtrants :
aucun trajet annulé ou passé n'est renvoyé.

## 9. Pagination

```http
GET /api/v1/trips?limit=20&cursor=eyJpZCI6Ii4uLiJ9

{
  "items": [ ... ],
  "next_cursor": "eyJpZCI6IjE1In0",
  "has_more": true
}
```

Le curseur encode le critere de tri, pas un offset. `limit` est plafonne cote
serveur, a 100 par defaut.

## 10. Evolution du contrat

- Une ressource exposee ne supprime jamais un champ dans la version majeure
  courante : il est deprece, puis retire en `v2`.
- Les champs sont additifs dans `v1`. Un client doit ignorer ceux qu'il ne
  connait pas.
- `/api/v1` reste un service sans etat : deploiement et versionnage sont
  independants.
