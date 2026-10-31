# infrastructure

Configuration d'infrastructure qui n'appartient ni au code applicatif ni aux
conteneurs eux-memes.

## Contenu

    db/init/001-extensions.sql

Script execute par l'image PostgreSQL au **premier** demarrage du volume, via
le mecanisme `docker-entrypoint-initdb.d`. Il installe :

- `postgis` - geometrie et index spatiaux, indispensables au matching.
- `citext` - adresses email insensibles a la casse.
- `unaccent` - recherche sans accents.
- `pg_trgm` - recherche approximative sur les noms de ville.

## Avertissement important

Ces scripts ne s'executent que lorsque le volume `trajio_pgdata` est cree
vide. Ajouter une ligne ici n'a donc aucun effet sur une base deja initialisee.

Pour modifier le schema d'une base existante, il faut passer par une migration
Alembic : elle est versionnee, testee, et se rejoue a l'identique sur un autre
environnement. Un script d'initialisation n'a aucune de ces proprietes.

La pile Compose inclut aussi Redis (limites de debit partagees entre workers).

## Ajouts prevus

- Reverse proxy et certificats TLS.
- Sauvegardes `pg_dump` chiffrees.
- Configuration de journalisation et de rotation.
