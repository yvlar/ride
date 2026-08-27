# Codes postaux canadiens (FR-040)

Ride résout un code postal canadien complet saisi dans le champ de destination
**Adresse, ville ou code postal** (`FR-038`). Le reste de la recherche — adresse,
ville, POI, clic sur la carte — ne change pas (`FR-032`, `FR-017`).

## Source des données

- Jeu de données : **CP Territoires**, publié sur **Données Québec**.
- API : CKAN `datastore_search`
  (`https://www.donneesquebec.ca/recherche/api/3/action/datastore_search`).
- `resource_id` : `bbd5521c-120f-494b-b2a3-a6a682d8d458`.
- Couverture actuelle : **Québec**.

Les données proviennent de Données Québec / CP Territoires et restent soumises à
la licence du jeu de données : l’attribution de la source doit être conservée
partout où ces coordonnées sont diffusées. La colonne `source` de la table porte
cette attribution pour chaque enregistrement.

Données Québec est une **source de synchronisation**, pas une dépendance
d’exécution : l’API publique n’est jamais appelée pendant une recherche
utilisateur.

## Pipeline

```
Données Québec (CP Territoires)
        │  npm run update:postal-codes
        ▼
scripts/update-quebec-postal-codes.ts
        │  validation → déduplication → upsert
        ▼
Supabase · postal_codes_quebec
        ▼
PostalCodeProvider (src/domain/postal-codes/postal-code-provider.ts)
        ▼
/api/geocode  (src/application/search-destination-places.ts)
        ▼
Recherche de destination Ride → carte → Générer le trajet
```

### Couches

| Couche | Fichier |
| --- | --- |
| Normalisation et validation | `src/domain/postal-codes/normalize-postal-code.ts` |
| Modèle de destination | `src/domain/postal-codes/postal-code.ts` |
| Port de lecture | `src/domain/postal-codes/postal-code-provider.ts` |
| Déduplication CP Territoires | `src/domain/postal-codes/deduplicate-postal-codes.ts` |
| Adaptateur Supabase | `src/infrastructure/postal-codes/supabase-postal-code-provider.ts` |
| Adaptateur source Données Québec | `src/infrastructure/postal-codes/quebec-source.ts` |
| Orchestration recherche + repli | `src/application/search-destination-places.ts` |
| Route serveur | `src/app/api/geocode/route.ts` |

Aucun composant React ne parle à Supabase : l’interface appelle `/api/geocode`
comme aujourd’hui.

## Normalisation

`normalizeCanadianPostalCode()` retire les espaces (y compris insécables), le
tiret et la casse, puis valide la forme de Postes Canada `A1A1A1` (sans les
lettres D, F, I, O, Q, U; sans W ni Z en première position).

| Saisie | Résultat |
| --- | --- |
| `J2G 2W4` | `J2G2W4` |
| `j2g2w4` | `J2G2W4` |
| ` J2G 2W4 ` | `J2G2W4` |
| `123456`, `ABCDEF`, `J2G`, `` | `null` (aucune recherche exacte) |

Le stockage et la requête utilisent la forme compacte `J2G2W4`; l’affichage
utilise `J2G 2W4`.

## Déduplication

Un même code postal couvre parfois plusieurs territoires dans CP Territoires.
Ride conserve **une** destination principale par code postal :

1. `PRC_REP` le plus élevé;
2. à égalité, `NB_UNITE_AD` le plus élevé;
3. à égalité encore, départage stable (municipalité, latitude, longitude).

Une valeur absente est toujours moins prioritaire qu’une valeur connue. La
première ligne rencontrée n’est jamais retenue par défaut.

## Base de données

Migration : `supabase/migrations/20260826120000_postal_codes_quebec.sql`.

- `postal_codes_quebec` : `postal_code` (clé primaire, sans espace), `latitude`,
  `longitude`, `municipality`, `prc_rep`, `address_units`, `source`,
  `source_resource_id`, `source_updated_at`, `imported_at`.
- `postal_code_imports` : journal des exécutions du pipeline (`status`,
  `source_rows`, `postal_codes`, `inserted`, `updated`, `error`).

RLS est activé sur les deux tables. `postal_codes_quebec` n’expose qu’un `select`
aux rôles `anon` et `authenticated`; aucune politique d’écriture n’existe, et
`insert`/`update`/`delete` sont révoqués. Le journal d’import reste entièrement
privé. Seul le pipeline serveur écrit, avec la clé `service_role` qui contourne
RLS.

Les privilèges de `service_role` sont accordés **explicitement**
(`20260827090000_postal_codes_service_role_grants.sql`) : les privilèges par
défaut de Supabase ne survivent pas à la révocation appliquée aux rôles
clients, et leur absence fait échouer l’import avec un `HTTP 403` dès sa
première requête.

La recherche est une égalité sur la clé primaire :

```sql
select postal_code, latitude, longitude, municipality
from postal_codes_quebec
where postal_code = 'J2G2W4'
limit 1;
```

Jamais de `like '%…%'`, jamais de téléchargement de la table. La clé primaire
fournit déjà l’index nécessaire : aucun index supplémentaire n’est créé. Aucun
cache applicatif n’est ajouté — une lecture exacte sur clé primaire n’en a pas
besoin, et le jeu de données n’est jamais embarqué dans le bundle.

## Variables d’environnement

Toutes côté serveur. **Aucune clé privilégiée ne doit utiliser `NEXT_PUBLIC_`.**

| Variable | Utilisée par | Rôle |
| --- | --- | --- |
| `SUPABASE_URL` | application + pipeline | URL du projet Supabase |
| `SUPABASE_ANON_KEY` | application | lecture seule via RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | pipeline uniquement | écriture de l’import |

Si `SUPABASE_URL` ou `SUPABASE_ANON_KEY` est absente, la recherche par code
postal est simplement débranchée : la recherche de destination continue de
fonctionner avec le fournisseur de géocodage.

## Mise à jour des données

```bash
npm run update:postal-codes                # récupère, valide et importe
npm run update:postal-codes -- --dry-run   # valide la source sans écrire
```

Le script lit `.env.local` s’il existe (comme `next dev`), sinon les variables
d’environnement du shell :

```bash
# .env.local
SUPABASE_URL=https://<projet>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<clé secrète, jamais commitée>
```

`.env.local` est déjà ignoré par git. La clé `service_role` (ou une clé secrète
`sb_secret_…`) ne sert qu’à ce script : elle ne doit jamais être définie sur un
build client ni dans Vercel pour l’application.

`--dry-run` n’écrit rien et n’a besoin d’aucune clé : c’est la façon la plus
sûre de vérifier la source avant un premier import.

Le script :

1. pagine CKAN (`limit=5000`) jusqu’à `result.total`, avec réessais;
2. valide l’enveloppe CKAN et chaque ligne;
3. déduplique par code postal;
4. vérifie les garde-fous;
5. fait un `upsert` par lots de 500 sur `postal_code`;
6. affiche un résumé et journalise l’exécution dans `postal_code_imports`;
7. sort avec un code non nul en cas d’échec.

Il est **idempotent** : deux exécutions successives ne créent pas de doublon.

### Garde-fous

L’import est refusé — sans jamais toucher aux données existantes — lorsque :

- la source retourne 0 enregistrement, ou une pagination incomplète;
- aucun code postal valide ne subsiste après validation;
- moins de 100 000 codes postaux uniques sont obtenus (la source en compte
  environ 220 000);
- plus de 10 % des lignes valides n’ont pas de municipalité;
- le nouveau jeu couvre moins de la moitié des codes postaux déjà stockés.

Le script n’efface jamais la table : il n’émet que des `upsert`. Une panne de
Données Québec laisse donc la production intacte.

### Exécuter sans environnement local

`.github/workflows/update-postal-codes.yml` lance le même script sur GitHub
Actions, **à la main** : onglet **Actions → Update postal codes → Run
workflow** (une case permet de forcer `--dry-run`). Deux secrets de dépôt sont
requis dans **Settings → Secrets and variables → Actions** : `SUPABASE_URL` et
`SUPABASE_SERVICE_ROLE_KEY`. La clé secrète reste dans GitHub; elle n’est ni
dans le dépôt, ni sur Vercel.

Le bouton **Run workflow** n’apparaît qu’une fois le fichier présent sur la
branche par défaut.

### Automatisation

Aucune planification n’est active : le déclenchement est manuel. Le bloc
`schedule` du workflow est prêt mais commenté; le script est sans état,
idempotent et retourne un code de sortie exploitable, donc Supabase Cron ou
Vercel Cron conviendraient tout aussi bien.

Vercel n’exécute **pas** l’import : l’application déployée n’a besoin que de
`SUPABASE_URL` et `SUPABASE_ANON_KEY`. La clé `service_role` ne doit jamais y
être définie.

## Évolution vers d’autres provinces

Le domaine ne suppose jamais que « tous les codes postaux sont au Québec ». La
région est portée par l’adaptateur (`QUEBEC_POSTAL_CODES_REGION`). Une table
`postal_codes_canada` se brancherait derrière le même `PostalCodeProvider`, sans
changement dans l’interface ni dans la couche métier.
