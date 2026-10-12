# packages

Dossier reserve aux elements partages entre le frontend et le backend.

Il est volontairement vide en v0.1.0 : il n'existe encore qu'un seul paquet
JavaScript, et un second n'est pas justifie. Activer les workspaces npm
reviendrait a forcer une reinstallation complete pour un gain nul (ADR-011).

Usages prevus :

- Jetons de design partages entre le frontend et les e-mails transactionnels.
- Schemas de validation generes a partir des modeles Pydantic de l'API.
- Bibliotheque de composants plus riche que `components/ui`.

Dans tous les cas, la regle reste la meme : un element place ici ne doit jamais
contenir de logique metier ni de secret.
