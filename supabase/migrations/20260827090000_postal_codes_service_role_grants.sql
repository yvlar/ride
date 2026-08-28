-- FR-040 — privilèges du pipeline d’import.
--
-- Le pipeline serveur (scripts/update-quebec-postal-codes.ts) écrit avec le
-- rôle `service_role`. La migration précédente révoquait l’écriture aux rôles
-- clients, mais les privilèges par défaut de `service_role` ne survivaient pas
-- à cette révocation : l’import échouait avec un HTTP 403 dès sa première
-- requête, avant toute écriture.
--
-- Les privilèges du pipeline sont donc accordés explicitement, sans dépendre
-- des privilèges par défaut. Les rôles clients ne gagnent rien ici : ils
-- gardent `select` sur les codes postaux et aucun accès au journal d’import.

grant select, insert, update, delete on public.postal_codes_quebec to service_role;
grant select, insert, update on public.postal_code_imports to service_role;
