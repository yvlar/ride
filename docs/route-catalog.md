# Catalogue de trajets moto

Ride publie des trajets GPX vérifiés dans Supabase et les présente dans l'app
selon une hiérarchie stable :

```text
pays → province / État / territoire → région → trajet → version GPX
```

La première collection contient 10 trajets du Québec. Le modèle contient déjà
les nœuds Canada, Québec, Ontario et États-Unis; ajouter l'Ontario ou un État
américain ne demande donc ni nouvelle table ni nouvelle API.

## Architecture

| Élément | Rôle |
| --- | --- |
| `ride_route_countries` | Pays ISO 3166-1 (`CA`, `US`) |
| `ride_route_subdivisions` | Provinces, États et territoires ISO 3166-2 |
| `ride_route_regions` | Régions navigables et futurs sous-catalogues (`parent_id`) |
| `ride_routes` | Métadonnées, statut et géométrie PostGIS du trajet |
| `ride_route_region_links` | Régions traversées; une seule est primaire pour le classement |
| `ride_route_assets` | Versions GPX et sommes SHA-256, chargées uniquement sur demande |
| `ride_route_imports` | Journal privé des imports |
| `ride_route_catalog` | Vue publique légère d'un trajet publié, sans XML GPX |
| `ride_route_catalog_tree` | Arbre pays/province/région et compteurs de trajets |

Le fichier GPX est conservé dans une table séparée. Une liste de 100 trajets ne
télécharge donc jamais leur XML. La géométrie PostGIS sert à l'aperçu, aux
limites cartographiques et, plus tard, aux recherches à proximité.

La couche React n'appelle jamais Supabase directement :

```text
RouteCatalogPanel
      ↓ HTTP
/api/route-catalog
      ↓ RouteCatalogProvider
SupabaseRouteCatalogProvider
      ↓ PostgREST + clé anon côté serveur
Supabase / RLS
```

Le GPX sélectionné repasse ensuite dans `parseGpxDocument()` et
`composeGpxRoute()`. L'aperçu, le raccordement depuis la position GPS et le
suivi utilisent ainsi le moteur GPX existant de Ride.

## API serveur

| Requête | Résultat |
| --- | --- |
| `GET /api/route-catalog` | Arbre complet et page de trajets publiés |
| `GET /api/route-catalog?country=CA&subdivision=CA-QC&region=estrie` | Liste filtrée |
| `GET /api/route-catalog/{slug}` | Détail et géométrie simplifiée |
| `GET /api/route-catalog/{slug}/gpx` | GPX primaire, ETag SHA-256 et cache HTTP |

Filtres facultatifs : `country`, `subdivision`, `region`, `locale`, `limit`
(maximum 100) et `offset`. Les identifiants invalides sont refusés avant
d'atteindre Supabase. Un trajet en brouillon ou archivé répond comme un trajet
absent.

## Sécurité

- RLS est activé sur toutes les tables du catalogue.
- `anon` et `authenticated` peuvent seulement lire les nœuds actifs et les
  trajets publiés.
- Aucune politique d'écriture client n'existe.
- Les privilèges Data API sont accordés explicitement; la configuration ne
  dépend pas des valeurs par défaut Supabase.
- `ride_route_imports` n'est jamais lisible par les clients.
- `SUPABASE_ANON_KEY` accepte la clé `sb_publishable_…` actuelle de Supabase
  (recommandée) ou une ancienne clé `anon` JWT.
- Seul l'importeur serveur utilise `SUPABASE_SERVICE_ROLE_KEY`.
- Un trajet ne peut passer à `published` sans région primaire ni GPX primaire.

## Importer une collection

Le manifeste versionné décrit la taxonomie et les métadonnées. Les fichiers GPX
peuvent rester dans un répertoire de travail externe au dépôt :

```bash
npm run import:route-catalog -- \
  --manifest data/route-catalog/quebec-2026.json \
  --gpx-dir ../parcours-moto-quebec-gpx \
  --dry-run
```

La simulation valide notamment :

- le schéma du manifeste et les liens pays/province/région;
- les chemins et la taille maximale de 5 Mo;
- l'absence de `DOCTYPE` et d'entités XML;
- les coordonnées, le nombre de points et la fermeture des boucles;
- une distance GPX à moins de 5 % (minimum 2 km) de la distance déclarée;
- l'unicité des slugs et des fichiers.

Après validation, retirer `--dry-run` avec `SUPABASE_URL` et
`SUPABASE_SERVICE_ROLE_KEY` définies côté serveur. L'import est idempotent : la
taxonomie, le trajet, les associations et la version GPX sont mis à jour par
leurs clés stables. Un nouveau trajet est d'abord créé en brouillon, reçoit sa
région et son GPX, puis est publié.

## Ajouter l'Ontario ou les États-Unis

1. Ajouter la subdivision au manifeste, par exemple `CA-ON`, ou un code d'État
   ISO 3166-2 comme `US-VT` avec `type: "state"`.
2. Ajouter ses régions avec des slugs uniques dans cette subdivision.
3. Ajouter chaque trajet et ses `regionKeys` (`CA-ON/algonquin`, par exemple);
   indiquer une `primaryRegionKey` pour sa place dans l'arbre.
4. Exécuter d'abord l'import avec `--dry-run`, puis l'import serveur.

Les routes transfrontalières ou traversant plusieurs régions utilisent
`regionKeys`. Une seule région primaire détermine leur emplacement principal;
les autres associations restent disponibles pour de futurs filtres avancés.

## Migration

Le schéma se trouve dans
`supabase/migrations/20260828170000_ride_route_catalog.sql`. Il active PostGIS
dans le schéma `extensions`, ajoute les index B-tree, GIN et GiST nécessaires,
les vues `security_invoker`, les politiques RLS et les privilèges explicites.
