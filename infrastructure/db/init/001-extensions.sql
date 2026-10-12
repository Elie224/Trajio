-- Extensions PostgreSQL installees au premier demarrage du volume.
--
-- Ce script n'est execute QUE lorsque le volume de donnees est cree vide.
-- Pour ajouter une extension a une base existante, faites-le via une
-- migration Alembic, afin que l'operation soit versionnee et reproductible.

-- Geometrie, index spatiaux et fonctions de projection : indispensable au
-- module de matching (voir docs/matching.md).
CREATE EXTENSION IF NOT EXISTS postgis;

-- Recherche insensible a la casse et aux accents, pour les villes et adresses.
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Recherche approximative (fautes de frappe) sur les libelles de ville.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
