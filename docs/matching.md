# Moteur de matching geographique

> **Statut : conception.** Aucun code n'est ecrit. Ce document fixe
> l'algorithme de la version 1 afin qu'il soit lisible avant d'etre programme.

## 1. Le probleme

Trouver un passager pour un trajet ne se resume pas a "proposer les trajets qui
partent de la meme ville". Le cas d'usage central de Trajio est le suivant :

    Conducteur : Sarcelles    -> Paris
    Passager  : Saint-Denis  -> Paris

Le conducteur ne passe pas a Saint-Denis, mais il passe a moins de 2 km. La
question n'est donc pas "les points de depart sont-ils identiques ?" mais
**"le passager peut-il etre cale sur l'itineraire du conducteur, avec un detour
acceptable, dans un creneau horaire compatible ?"**

Cela se decompose en trois questions independantes :

1. **Ou** : le point de rendez-vous est-il assez proche de la route ?
2. **Quand** : le conducteur passe-t-il au bon moment ?
3. **Combien** : quel detour le passager ajoute-t-il ?

## 2. Principe directeur

**Generer large, classer finement.** Une premiere etape grossiere et tres
rapide elimine l'essentiel des trajets ; une seconde, plus couteuse, ne
s'execute que sur les survivants et produit le score.

Cette separation evite le piege classique : appliquer un calcul de detour, qui
exige la polyligne, a toute la table. La premiere etape s'appuie uniquement sur
l'index spatial ; la seconde travaille sur quelques centaines de lignes au plus.

Aucun modele predictif, aucune IA generative (ADR-008). Chaque score est une
combinaison de poids explicites, donc verifiable et explicable a l'utilisateur.

## 3. Entrees et sorties

**Entrees**

| Parametre | Type | Origine |
|---|---|---|
| `pickup_point` | `geography(Point,4326)` | Point saisi par le passager |
| `dropoff_point` | `geography(Point,4326)` | Point saisi par le passager |
| `earliest` / `latest` | `timestamptz` | Creneau souhaite |
| `radius_m` | `int` | `driver_profiles.default_radius_m`, borne par `MAX_SEARCH_RADIUS_M` |
| `min_seats` | `int` | Nombre de places cherchees |
| `excluded_driver_ids` | `uuid[]` | Historique et blocages |

**Sortie**

    MatchResult[]
      trip_id              uuid
      score                float   0.0 a 1.0
      pickup_point         geography(Point,4326)  point propose au passager
      pickup_offset_m      float                  ecart a la route
      detour_ratio         float                  detour / longueur du trajet
      estimated_pickup_at  timestamptz
      reasons              Breakdown              detail par critere

Le champ `reasons` est ce qui permet d'afficher "2,1 km de detour, pickup a
18 min" au lieu d'un score opaque. C'est un argument de confiance central pour
un service de transport entre particuliers.

## 4. Etape 1 : generation de candidats

On ne conserve que les trajets qui, en dur, ne peuvent pas convenir.

```sql
WITH search AS (
    SELECT
        ST_SetSRID(ST_MakePoint(:pickup_lon,  :pickup_lat),  4326)::geography AS pickup,
        ST_SetSRID(ST_MakePoint(:dropoff_lon, :dropoff_lat), 4326)::geography AS dropoff,
        CAST(:radius_m AS integer) AS radius,
        CAST(:window_start AS timestamptz) AS win_start,
        CAST(:window_end   AS timestamptz) AS win_end,
        CAST(:min_seats AS smallint) AS min_seats
)
SELECT
    t.id,
    t.driver_id,
    t.route_distance_m,
    t.departure_time,
    t.seats_available,
    ST_LineLocatePoint(t.route, s.pickup)  AS pickup_pos,
    ST_LineLocatePoint(t.route, s.dropoff) AS dropoff_pos,
    ST_Distance(t.route, s.pickup)  AS pickup_offset_m,
    ST_Distance(t.route, s.dropoff) AS dropoff_offset_m
FROM trips t
CROSS JOIN search s
WHERE t.status = 'scheduled'
  AND t.deleted_at IS NULL
  AND t.seats_available >= s.min_seats
  AND t.route IS NOT NULL
  AND t.departure_time >= s.win_start
  AND t.departure_time <= s.win_end
  -- Pre-filtre spatial : joue sur l'index GiST de trips.route
  AND ST_DWithin(t.route, s.pickup,  s.radius)
  AND ST_DWithin(t.route, s.dropoff, s.radius)
  -- Coherence de sens : le passager monte AVANT de descendre
  AND ST_LineLocatePoint(t.route, s.pickup) < ST_LineLocatePoint(t.route, s.dropoff)
ORDER BY ST_Distance(t.route, s.pickup) + ST_Distance(t.route, s.dropoff)
LIMIT 200;
```

### Pourquoi la position le long de la route est le coeur du probleme

L'inegalite `pickup_pos < dropoff_pos` exprime la compatibilite de direction
sans passer par un calcul d'azimut. `ST_LineLocatePoint` renvoie la position
relative du point le long de la ligne, entre 0 (origine) et 1 (destination).

- Si le passager est ramasse a 0,2 et depose a 0,7, il est cale dans le bon
  sens : conforme.
- S'il est ramasse a 0,7 et depose a 0,2, il faudrait faire demi-tour :
  rejete.

Un test par azimut ne suffirait pas : deux trajets paralleles peuvent avoir le
meme azimut tout en etant decales de plusieurs kilometres. La projection sur la
ligne tient compte de la position reelle, pas seulement de l'orientation.

### La limite a 200 est un garde-fou, pas une optimisation

La requete trie par distance cumulee a la route. Limiter a 200 garantit que
l'etape 2 ne travaille que sur une taille bornee, quelle que soit la densite
urbaine. Au-dela, les candidats sont de toute facon trop eloignes pour etre
acceptables.

## 5. Etape 2 : score

Chaque critere produit un sous-score dans `[0, 1]`, ou 0 signifie "elimine".
Le score final est une moyenne ponderee.

| # | Critere | Poids | Calcul |
|---|---|---|---|
| 1 | Proximite du rendez-vous | 0,25 | `1 - min(pickup_offset, dropoff_offset) / radius` |
| 2 | Detour | 0,30 | `1 - min(detour_ratio / max_detour_ratio, 1)` |
| 3 | Compatibilite horaire | 0,20 | voir 5.2 |
| 4 | Direction | 0,15 | `1 - (dropoff_pos - pickup_pos) / ideal_span` |
| 5 | Places disponibles | 0,10 | `(seats_available - min_seats + 1) / seats_total` |

Les poids sont des constantes dans `matching/scoring.py`, surchargeables par la
configuration. Aucun n'est ecrit en dur dans la requete SQL.

### 5.1 Detour

L'itineraire du conducteur passe par quatre points : depart, pickup, dropoff,
arrivee. Le detour est la longueur supplementaire imposee au conducteur.

```sql
WITH pts AS (
    SELECT
        t.id,
        t.origin_point,
        t.destination_point,
        t.route_distance_m,
        ST_LineInterpolatePoint(t.route, c.pickup_pos)  AS on_route_pickup,
        ST_LineInterpolatePoint(t.route, c.dropoff_pos) AS on_route_dropoff
    FROM candidates c
    JOIN trips t ON t.id = c.trip_id
)
SELECT
    t.id,
    ST_Distance(t.origin_point,         p.on_route_pickup)
  + ST_Distance(p.on_route_pickup,     p.on_route_dropoff)
  + ST_Distance(p.on_route_dropoff,    t.destination_point) AS total_distance_m,
    t.route_distance_m
FROM pts p
JOIN trips t ON t.id = p.id;
```

Le detour relatif vaut `(total_distance_m - route_distance_m) /
route_distance_m`. Le trajet est ecarte si ce ratio depasse
`trips.max_detour_ratio`, ou si le detour absolu depasse
`driver_profiles.max_detour_minutes` converti en distance a la vitesse
moyenne retenue.

### 5.2 Compatibilite horaire

Le passager fournit un creneau, pas un instant. On estime l'heure de passage du
conducteur au point de rendez-vous :

```text
eta_pickup = departure_time + (trip_duration * pickup_pos)
```

Ou `trip_duration = arrival_time - departure_time`. Le sous-score vaut 1 si
`eta_pickup` tombe dans le creneau, et decroit lineairement sur une tolerance
de part et d'autre, configurable (15 minutes par defaut).

### 5.3 Points de rendez-vous proposes

Le point propose au passager n'est pas celui qu'il a saisi : c'est
`ST_ClosestPoint(route, pickup_point)`, projet orthogonal sur la route. Cela
garantit un point joignable depuis l'itineraire, donc une duree de detour
credible, et evite d'envoyer un passant devant une breche de peage.

Une projection en zone privee (parking, tunnel) doit pouvoir etre corrigee
manuellement par le conducteur : c'est le role du champ `trip_stops`.

## 6. Cas degrades

### 6.1 Trajet sans polyligne

Tant que le moteur d'itineraire n'est pas branche, certains trajets n'ont pas
de route (`route IS NULL`). Une deuxieme strategie, moins precise, s'applique
alors, sur les points de depart et d'arrivee.

```sql
ST_DWithin(t.origin_point, s.pickup,  s.radius)
AND ST_DWithin(t.destination_point, s.dropoff, s.radius)
AND abs(
      ST_Azimuth(t.origin_point, s.pickup)
    - ST_Azimuth(s.pickup, s.dropoff)
) < radians(45)
```

Cette variante utilise les index sur `origin_point` et `destination_point`.
Elle est moins juste sur le detour : les resultats doivent etre distingues dans
l'interface, avec la mention "direction approximative".

### 6.2 Geocodage indisponible

Si le passager ne fournit qu'un nom de ville, le point est resolu par
geocodage avant la recherche. Le resultat est memorise dans la table `places`
pour eviter de repayer le geocodage a chaque appel.

### 6.3 Aucun resultat

Ne pas elargir silencieusement au-dela de `MAX_SEARCH_RADIUS_M`. Proposer
explicitement "chercher dans un rayon de 10 km" laisse l'utilisateur decider, et
evite une recherche plusieurs fois plus couteuse.

## 7. Performance

| Optimisation | Effet |
|---|---|
| Index GiST sur `trips.route` | Rend `ST_DWithin` indexable |
| Index partiel `ix_trips_open_departure` | La table scannee ne contient que les trajets actifs |
| Limite a 200 candidats | L'etape 2 a une taille bornee |
| Colonne `route_distance_m` | Evite un `ST_Length` par ligne |
| `seats_available >= min_seats` dans le WHERE | Filtre applique avant le scoring |

L'ordre d'execution a verifier avec `EXPLAIN` : le filtre spatial doit
eliminer le maximum de lignes avant tout tri.

## 8. Testabilite

Le matching se teste sans base reelle si la geometrie est calculee en Python pur
sur des scenarios fixes. Scenarios prevus :

| Scenario | Attendu |
|---|---|
| Passage exact sur la route | detour nul, score maximal |
| Passage a 1,5 km de la route | accepte si sous le rayon |
| Passage a 12 km de la route | rejete par le pre-filtre |
| Point de rendez-vous a l'envers | rejete par `pickup_pos < dropoff_pos` |
| Creneau decale de 2 heures | sous-score horaire nul |
| Route parallele decalee de 5 km | ecartee par la distance, malgre l'azimut |
| Detour de 80 % | rejete par `max_detour_ratio` |
| Plus de places disponibles | exclu a la generation |

## 9. Limites connues

- **La polyligne est statique.** Un itineraire change a cause de travaux ou de
  congestion ; la version 1 ne gere pas le trafic.
- **Pas de replanning automatique.** Si le conducteur a 30 minutes de retard,
  les reservations ne sont pas rejouees.
- **Un seul passager propose a la fois.** Optimiser le remplissage du vehicule
  releve de l'ordonnancement et n'est pas prevu.
- **Geometrie sans historique.** Un conducteur qui evite volontairement une zone
  ne peut pas le declarer. Extensions possibles : zones interdites, preferences
  de pont, zones a faibles emissions.

Ces limites sont assumees pour la v1. Elles sont documentees plutot que
masquees par une complexite premature.
