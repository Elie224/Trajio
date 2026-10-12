# Securite, RGPD et reglementation

> **Statut : intention.** Seul le mecanisme de configuration et l'alerte au
> demarrage sur `SECRET_KEY` sont en place. Le reste est a implementer avec les
> modules correspondants.

## 1. Gestion des secrets

| Regle | Mise en oeuvre |
|---|---|
| Aucun secret dans Git | `.env` est ignore ; seul `.env.example` est versionne |
| Une seule source de verite | `app/core/config.py` lit tout l'environnement |
| Valeurs par defaut visibles | `SECRET_KEY` de developpement declenche une alerte au demarrage |
| Generation | `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| Production | gestionnaire de secrets externe ; jamais de `.env` sur le serveur |

Cote Next.js, seule variable publique : `NEXT_PUBLIC_API_BASE_URL`, qui ne
contient aucun secret. Tout le reste vit dans l'API.

## 2. Mots de passe

- Argon2id via `pwdlib`, avec les parametres OWASP par defaut.
- Rehachage automatique si les parametres par defaut changent.
- Comparaison en temps constant par construction.
- Politique minimale : 12 caracteres minimum, et rejet des mots de passe les
  plus frequents.
- Aucune question de securite, aucune reutilisation d'identifiants externes
  (numero de telephone, SIREN).

## 3. Sessions et jetons

| Element | Regle |
|---|---|
| Acces | JWT 60 min, non stocke en base |
| Renouvellement | JWT 30 jours, **hash** stocke en base |
| Revocation | suppression du jeton de renouvellement |
| Transport | HTTPS obligatoire ; `HttpOnly` et `SameSite` sur les cookies |
| Logout | invalide le renouvellement ; l'acces deja emis expire seul |

Stocker le hash et non le jeton evite qu'une fuite de la table donne
directement des sessions actives.

## 4. Autorisations

Regle unique : **toute autorisation est verifiee cote serveur**, sur la
propriete de la ressource.

Le frontend masque un bouton pour le confort, jamais pour la securite. Un appel
direct a l'API doit obtenir le meme refus que si l'interface ne montrait rien.

Trois roles : `passenger`, `driver`, `admin`. Le role n'accorde jamais un
droit implicite : chaque endpoint declare explicitement ce qu'il exige, et
chaque regle a un test negatif associe.

## 5. Validation des entrees

- Pydantic valide et normalise toute entree. Aucune donnee n'atteint la base
  sans passer par un schema.
- Les requetes SQL sont exclusivement construites avec SQLAlchemy lie. Aucun
  SQL concatene a partir d'une entree utilisateur.
- Bornes de pagination, durees et montants sont plafonnes cote serveur. Un
  client qui demande 100 000 elements obtient une erreur, pas une saturation.
- Les richtextes passent par une liste blanche de balises. Pas de HTML brut.

## 6. Protection contre les abus

| Risque | Contre-mesure prevue |
|---|---|
| Enumeration de comptes | Message et temps de reponse identiques, que l'email existe ou non |
| Depot de spam | Limitation de debit sur inscription, message et signalement |
| Course aux places | Verrou `FOR UPDATE` sur le trajet (voir api-design.md) |
| Faux comptes | Verification email et telephone avant reservation |
| Usurpation d'identite | Verification de piece d'identite et de permis avant publication |
| Retenue en otage | Annulation possible jusqu'au depart, avec penalite tarifee |
| Harcelement | Blocage mutuel, signalement, historique conserve |

Les quotas doivent etre appliques sur l'IP **et** sur le compte : un seul des
deux se contourne trop facilement.

## 7. Verification des utilisateurs

Le covoiturage met en contact des inconnus. La verification est donc une
fonction de securite, pas une formalite.

| Niveau | Pour quel usage | Statut requis |
|---|---|---|
| Email | inscription | `email_verified_at` renseigne |
| Telephone | reserver | `phone_verified_at` renseigne |
| Identite | publier un trajet | `id_document_status = 'verified'` |
| Permis | publier un trajet | `license_verified_at` renseigne |

La verification doit etre externalisee a un prestataire specialise, encadre
par un contrat de sous-traitance RGPD. Elle ne doit pas etre implementee en
interne sur des documents d'identite.

## 8. RGPD

Trajio traite des donnees sensibles : position, horaires, identite, echanges
entre particuliers.

| Obligation | Mise en oeuvre |
|---|---|
| Base legale | Contrat pour le service ; interet legitime pour la securite et l'amelioration |
| Information | Privacy policy et registre des traitements, avant la mise en ligne |
| Consentement | Eclare, libre, specifique, revocable, pour tout usage non necessaire |
| Securite | Chiffrement en transit, disque chiffre, sauvegardes chiffrees |
| Conservation | Duree definie par finalite, avec purge automatique |
| Droits | Acces, rectification, effacement, opposition, portabilite, via un export automatise |
| Registre | Tenue a jour : traitements, durees, sous-traitants |
| Sous-traitants | Hebergement, email, SMS, verification d'identite : tous cadres |
| Violation | Procedure documentee, notification sous 72 heures |

Points d'attention :

- Les **positions exactes** sont des donnees de localisation : jamais publiques,
  jamais dans un payload de notification.
- Les **messages** sont des correspondances : leur duree de conservation doit
  etre fixee, meme s'ils disparaissent de l'interface.
- Le **suivi d'activite** n'est pas de l'amelioration du produit : il doit etre
  declare, ou supprime.

## 9. Reglementation du covoiturage en France

Le covoiturage reste une pratique non commerciale tant que le conducteur ne
retire aucun benefice : la participation ne peut couvrir que les frais reels du
trajet (carburant, usure, peage).

Criteres couramment retenus pour rester hors du transport commercial de
personnes :

| Criterie | Seuil usuel |
|---|---|
| Nombre de personnes | 1 conducteur et au moins 2 passagers |
| Detour accepte | au plus 30 % de la distance totale |
| Detour accepte | au plus 30 minutes |
| Financement | frais du trajet uniquement, aucun profit |

La colonne `trips.max_detour_ratio` (defaut 0,30) materialise ce detour
directement dans le modele : ce n'est pas seulement un critere de confort,
c'est une regle de droit inscrite dans le schema.

```text
Mise en garde : ce resume est un garde-fou technique, pas un avis juridique.
Avant la mise en ligne, faire valider le fonctionnement par un juriste, et
prevoir de pouvoir ajuster les seuils par configuration plutot que par code.
```

## 10. Contributions financieres

Le prix doit rester du conducteur vers le passager, borne au cout du trajet. En
pratique :

- `contribution_cents` est un entier ; aucun pourcentage libre.
- Un plafond configurable interdit une participation disproportionnee.
- La distinction `free` / `per_seat` existe deja dans le schema.
- Le paiement n'est pas integre a la v1 : c'est une decision a part entiere,
  avec ses obligations (sequestre, TVA eventuelle, facturation).

## 11. Hygiene de l'infrastructure

| Mesure | Mise en oeuvre |
|---|---|
| HTTPS | Terminaison TLS devant l'API et le web, redirection HTTP vers HTTPS |
| En-tetes | HSTS, `X-Content-Type-Options`, `X-Frame-Options`, referrer-policy |
| Conteneur API | Utilisateur non root `trajio`, image sans outils inutiles |
| Conteneur web | Utilisateur non root `nextjs` |
| Dependances | `npm audit` et `pip-audit` en integration continue |
| Images | Tag de version explicite, jamais `latest` en production |
| Sauvegardes | `pg_dump` chiffre, retention definie, restauration testee |
| Jaux d'essai | Regle `[0-9]+` supprimee des images Docker |

## 12. Journalisation

- Ne jamais journaliser de mot de passe, de jeton, ni de coordonnee exacte.
- `SQL_ECHO` reste faux : il ecrit les requetes parametrees en clair.
- Chaque erreur HTTP porte un `request_id`, present dans les journaux et dans
  la reponse client, pour correler sans divulguer de detail interne.
- Logs d'acces conserves 30 jours, logs de securite 6 mois.
