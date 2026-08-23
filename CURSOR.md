# Guide de développement pour Cursor — Ride

Ce document sert de cahier des charges technique et fonctionnel pour construire **Ride**, une application de génération de trajets moto. Cursor doit utiliser ce fichier comme source principale pour planifier et implémenter le projet. Le fichier `README.md` décrit la vision produit générale; en cas d’ambiguïté technique, les décisions ci-dessous prévalent pour le MVP.

## 1. Mission

Construire une application Web responsive, utilisable sur téléphone et ordinateur, ainsi qu’une coque iOS Capacitor qui expose le même flux, afin qu’un motocycliste puisse générer une route agréable à partir de quelques paramètres.

Le produit doit prendre en charge trois types de trajets :

1. **Boucle** : partir d’un point, parcourir approximativement une distance cible et revenir au départ.
2. **Destination** : relier un départ à une destination en privilégiant le plaisir de conduite.
3. **Aller-retour différent** : rejoindre une destination, puis revenir au départ en minimisant les routes communes entre l’aller et le retour.

Le principal avantage concurrentiel n’est pas la navigation GPS classique. C’est la capacité à générer rapidement une ride adaptée à la moto selon la distance, les courbes, le paysage, la surface et la répétition des routes.

## 2. Objectifs du MVP

Le MVP doit permettre de :

- saisir un départ et, selon le type, une destination;
- utiliser la position actuelle comme départ avec l’autorisation de l’utilisateur;
- choisir une distance cible en kilomètres;
- choisir une tolérance de distance;
- choisir un style : courbes, panoramique ou touring;
- éviter les autoroutes;
- éviter les routes non pavées;
- générer jusqu’à trois propositions de trajet;
- afficher chaque proposition sur une carte;
- afficher la distance, la durée et les statistiques essentielles;
- mesurer la répétition des segments d’un itinéraire;
- demander une autre route sensiblement différente;
- démarrer une navigation virage par virage de premier plan, avec instructions, guidage vocal et recalcul hors trajet;
- sauvegarder localement une ride;
- exporter un trajet en GPX.

## 3. Hors périmètre du MVP

Ne pas implémenter dans la première version :

- la localisation en arrière-plan, le fonctionnement écran verrouillé et la navigation hors ligne;
- un réseau social;
- les paiements ou abonnements;
- la météo en temps réel;
- les profils de plusieurs motos;
- les pauses automatiques et la gestion complète de l’autonomie;
- le partage public de trajets;
- une réécriture native Swift, SwiftUI, React Native ou Expo;
- une application Android;
- la publication App Store ou TestFlight;
- un moteur cartographique ou routier développé entièrement à l’interne.

La coque iOS Capacitor (`FR-027`, `NFR-007`) fait partie du MVP : projet Xcode dans `ios/`, localisation « When In Use » uniquement, GPS et navigation de premier plan. Le build signé, le simulateur et l’ouverture Xcode exigent macOS. Capacitor, WKWebView et les plugins restent des adaptateurs ; le domaine ne les référence pas.

Préparer l’architecture pour ces fonctions sans les construire prématurément.

## 4. Principes de développement pour Cursor

Cursor doit respecter les règles suivantes pendant l’implémentation :

- travailler par petites étapes vérifiables;
- ne pas inventer une API externe : consulter sa documentation avant l’intégration;
- isoler tout fournisseur externe derrière une interface interne;
- ne jamais exposer une clé secrète dans le code client;
- utiliser TypeScript en mode strict;
- éviter `any`; utiliser `unknown` puis valider les données;
- valider chaque entrée à la frontière du système;
- séparer la logique métier, l’accès aux données et l’interface;
- écrire des tests pour tout calcul de distance, score ou chevauchement;
- rendre les erreurs compréhensibles pour l’utilisateur;
- ne pas ajouter une dépendance si une fonction simple et testable suffit;
- conserver les unités explicitement dans les noms : `distanceKm`, `durationMinutes`, `tolerancePercent`;
- commenter les décisions complexes, pas le code évident;
- mettre à jour ce document lorsqu’une décision structurante change.

Avant une modification importante, Cursor doit :

1. résumer l’objectif;
2. indiquer les fichiers qui seront touchés;
3. identifier les risques ou hypothèses;
4. implémenter;
5. exécuter les validations pertinentes;
6. résumer ce qui reste à faire.

## 5. Pile technique proposée

Utiliser une architecture Web TypeScript simple et évolutive.

### Application

- **Next.js avec App Router** pour l’application Web et les routes serveur;
- **React** pour l’interface;
- **TypeScript strict** pour le typage;
- **Tailwind CSS** pour les styles;
- **MapLibre GL JS** pour la carte interactive;
- **Zod** pour la validation des formulaires, variables d’environnement et réponses externes;
- **React Hook Form** pour les formulaires;
- **Vitest** et Testing Library pour les tests unitaires et de composants;
- **Playwright** pour les parcours critiques de bout en bout;
- **Capacitor** pour la coque iOS (`ios/`), avec plugins de géolocalisation, barre de statut, splash et maintien d’écran. Le domaine ne dépend pas de Capacitor (`NFR-007`). Le build Xcode se fait sur macOS.

### Données

Pour le premier prototype, les rides peuvent être sauvegardées dans `localStorage` derrière une interface de dépôt. Lorsqu’un compte utilisateur est ajouté, migrer vers :

- PostgreSQL;
- PostGIS pour les géométries et calculs spatiaux;
- un ORM compatible avec PostgreSQL, choisi au moment de l’implémentation.

La logique métier ne doit pas dépendre directement de `localStorage`, de PostgreSQL ou de l’ORM.

### Routage et géocodage

Créer des adaptateurs interchangeables pour :

- le géocodage d’adresses;
- le calcul de route;
- la recherche de points d’intérêt;
- les tuiles cartographiques.

Le fournisseur de routage par défaut sans configuration reste `MockRoutingProvider` (`ROUTING_PROVIDER=mock`) : un graphe local déterministe, sans clé externe. Un adaptateur RAG optionnel (`ROUTING_PROVIDER=ai-rag`) indexe le même type de graphe sous forme de documents, récupère les arêtes proches de la demande, puis compose un chemin uniquement sur ces arêtes. Il n’affine pas de courbe géométrique et n’appelle pas de modèle distant.

`OsrmRoutingProvider` (`ROUTING_PROVIDER=osrm`) appelle un service OSRM configuré par `ROUTING_API_BASE_URL` et retourne une géométrie GeoJSON suivant les routes OpenStreetMap. `GraphHopper` et `Valhalla` restent des options remplaçables, non branchées. Les tests automatisés n’appellent pas de fournisseur externe.

Ne jamais appeler directement le fournisseur de routage depuis un composant React. Tous les appels passent par le serveur et par l’interface `RoutingProvider`.

## 6. Architecture logique

Séparer le projet en quatre couches :

```text
Interface utilisateur
        ↓
Cas d’utilisation / services applicatifs
        ↓
Logique métier du domaine
        ↓
Adaptateurs externes et persistance
```

### Responsabilités

#### Interface utilisateur

- formulaires;
- carte;
- états de chargement;
- messages d’erreur;
- comparaison et sélection des variantes.

#### Services applicatifs

- orchestration de la génération;
- appels aux fournisseurs;
- création de variantes;
- sauvegarde et export;
- transformation des données pour l’interface.

#### Domaine

- validation métier;
- calcul des scores;
- mesure de distance;
- calcul du chevauchement;
- classement des variantes;
- vérification des contraintes.

#### Infrastructure

- fournisseur de routage;
- géocodage;
- stockage local ou base de données;
- journalisation;
- métriques.

## 7. Structure de dossiers visée

```text
ride/
├── README.md
├── CURSOR.md
├── .env.example
├── package.json
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── geocode/route.ts
│   │   │   ├── routes/generate/route.ts
│   │   │   └── routes/export-gpx/route.ts
│   │   ├── rides/[id]/page.tsx
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── map/
│   │   ├── ride-form/
│   │   ├── route-results/
│   │   └── ui/
│   ├── domain/
│   │   ├── ride/
│   │   │   ├── types.ts
│   │   │   ├── schemas.ts
│   │   │   ├── scoring.ts
│   │   │   ├── overlap.ts
│   │   │   └── constraints.ts
│   │   └── geo/
│   │       ├── types.ts
│   │       ├── distance.ts
│   │       └── geometry.ts
│   ├── application/
│   │   ├── generate-ride.ts
│   │   ├── regenerate-ride.ts
│   │   └── export-ride.ts
│   ├── infrastructure/
│   │   ├── routing/
│   │   │   ├── routing-provider.ts
│   │   │   ├── provider-adapter.ts
│   │   │   └── mock-routing-provider.ts
│   │   ├── geocoding/
│   │   ├── persistence/
│   │   └── observability/
│   ├── lib/
│   └── test/
└── e2e/
```

Cette structure est une cible, pas une obligation de créer tous les fichiers dès le départ. Ne créer un module que lorsqu’il a une responsabilité réelle.

## 8. Modèle du domaine

Utiliser des unions discriminées pour représenter les types de trajets.

```ts
type Coordinates = {
  latitude: number;
  longitude: number;
};

type Place = {
  label: string;
  coordinates: Coordinates;
};

type RideStyle = "curvy" | "scenic" | "touring";
type DistanceTolerance = 5 | 10 | 20;

type RoutePreferences = {
  avoidHighways: boolean;
  avoidUnpaved: boolean;
  avoidTolls: boolean;
  maxRepeatedRoadPercent: number;
};

type LoopRideRequest = {
  type: "loop";
  start: Place;
  targetDistanceKm: number;
  tolerancePercent: DistanceTolerance;
  style: RideStyle;
  preferences: RoutePreferences;
};

type DestinationRideRequest = {
  type: "destination";
  start: Place;
  destination: Place;
  targetDistanceKm?: number;
  tolerancePercent?: DistanceTolerance;
  style: RideStyle;
  preferences: RoutePreferences;
};

type RoundTripRideRequest = {
  type: "round_trip";
  start: Place;
  destination: Place;
  targetDistanceKm?: number;
  tolerancePercent?: DistanceTolerance;
  style: RideStyle;
  preferences: RoutePreferences;
};

type GenerateRideRequest =
  | LoopRideRequest
  | DestinationRideRequest
  | RoundTripRideRequest;
```

### Route calculée

```ts
type RouteSegment = {
  id: string;
  geometry: GeoJSON.LineString;
  distanceKm: number;
  durationMinutes: number;
  roadName?: string;
  surface?: "paved" | "unpaved" | "unknown";
  roadClass?: string;
};

type RouteScores = {
  overall: number;
  curves: number;
  scenery: number;
  secondaryRoads: number;
};

type RouteStatistics = {
  highwayPercent: number;
  unpavedPercent: number;
  repeatedRoadPercent: number;
};

type RouteVariant = {
  id: string;
  label: string;
  geometry: GeoJSON.LineString;
  segments: RouteSegment[];
  distanceKm: number;
  durationMinutes: number;
  scores: RouteScores;
  statistics: RouteStatistics;
  warnings: string[];
  providerMetadata?: Record<string, unknown>;
};
```

Ne pas transmettre `providerMetadata` au navigateur s’il contient des données inutiles, sensibles ou soumises à des restrictions de licence.

## 9. Contrats des fournisseurs

### Routage

```ts
interface RoutingProvider {
  calculateRoute(input: ProviderRouteRequest): Promise<ProviderRouteResult>;
  calculateAlternatives(
    input: ProviderRouteRequest,
    count: number,
  ): Promise<ProviderRouteResult[]>;
}
```

`ProviderRouteRequest` doit pouvoir représenter :

- un départ;
- une destination;
- des points de passage facultatifs;
- les routes à éviter;
- la surface permise;
- un profil de conduite;
- les segments à pénaliser pour la régénération ou le retour.

Si le fournisseur ne permet pas de pénaliser des segments, l’adaptateur doit exposer cette limite. Le service applicatif utilisera alors des points de passage différents pour créer des corridors alternatifs.

### Géocodage

```ts
interface GeocodingProvider {
  search(query: string, locale: string): Promise<Place[]>;
  reverse(coordinates: Coordinates, locale: string): Promise<Place>;
}
```

Ajouter un délai de saisie, annuler les requêtes obsolètes et limiter le nombre de résultats.

## 10. API interne

Toutes les réponses suivent une forme cohérente.

### Succès

```json
{
  "data": {},
  "meta": {
    "requestId": "uuid"
  }
}
```

### Erreur

```json
{
  "error": {
    "code": "NO_ROUTE_FOUND",
    "message": "Aucun trajet ne respecte toutes les contraintes.",
    "suggestions": [
      "Augmenter la tolérance de distance",
      "Autoriser une petite portion d’autoroute"
    ]
  },
  "meta": {
    "requestId": "uuid"
  }
}
```

### `POST /api/routes/generate`

Entrée : `GenerateRideRequest` validé par Zod.

Sortie :

```ts
type GenerateRideResponse = {
  variants: RouteVariant[];
  relaxedConstraints: string[];
};
```

Règles :

- retourner de une à trois variantes valides;
- trier les variantes selon le style demandé;
- ne pas retourner deux variantes presque identiques;
- signaler toute contrainte relâchée;
- fixer un délai maximal raisonnable et gérer l’expiration proprement.

### `GET /api/geocode?q=...`

- refuser les requêtes trop courtes;
- limiter les résultats;
- mettre en cache les recherches fréquentes selon les conditions du fournisseur;
- ne jamais journaliser une adresse complète sans nécessité.

### `POST /api/routes/recalculate`

Entrée : position actuelle, type de trajet, style, préférences, géométrie restante et étapes restantes, validés par Zod.

Sortie : le trajet fusionné, ou une erreur métier qui conserve le trajet courant côté client.

Règles :

- n’accepter une position que pour un recalcul réellement nécessaire;
- conserver le style, `avoidHighways` et `avoidUnpaved`;
- passer uniquement par `RoutingProvider`;
- ignorer les réponses obsolètes;
- ne jamais journaliser de coordonnées.

### `POST /api/routes/export-gpx`

- accepter un identifiant de ride ou une géométrie validée;
- produire un fichier GPX valide;
- inclure le nom, les points de passage et le tracé;
- utiliser un nom de fichier sûr;
- ne jamais interpréter du XML fourni directement par le client.

## 11. Génération des trajets

Le générateur doit produire plusieurs candidats, les évaluer, éliminer les candidats invalides et conserver les meilleurs.

### Pipeline général

```text
Valider la demande
    ↓
Créer plusieurs ensembles de points de passage
    ↓
Demander les routes au fournisseur
    ↓
Normaliser les segments et géométries
    ↓
Calculer statistiques, contraintes et scores
    ↓
Éliminer les candidats invalides ou trop semblables
    ↓
Classer et retourner jusqu’à trois variantes
```

### Génération d’une boucle

Pour une distance cible `D` :

1. choisir plusieurs directions initiales réparties autour du départ;
2. calculer un rayon initial approximatif entre `D / 4` et `D / 3`;
3. créer deux ou trois points de passage formant une boucle;
4. ajouter une variation contrôlée au rayon et aux angles;
5. demander une route passant par ces points;
6. comparer la distance obtenue à la cible;
7. ajuster les points et recommencer un nombre limité de fois;
8. rejeter les boucles qui se croisent excessivement ou répètent trop de segments.

Ne pas utiliser une boucle géométrique parfaite : le réseau routier réel doit déterminer le tracé final.

### Génération vers une destination

1. demander plusieurs alternatives au fournisseur;
2. si les alternatives sont trop similaires, générer des points de passage dans des corridors latéraux;
3. éviter les détours disproportionnés;
4. classer selon le style et les contraintes;
5. conserver les variantes suffisamment distinctes.

### Aller-retour différent

1. calculer plusieurs routes d’aller;
2. sélectionner un aller admissible;
3. calculer le retour en pénalisant les segments de l’aller;
4. si la pénalisation directe est impossible, générer des points de passage dans un corridor opposé;
5. mesurer le chevauchement réel entre l’aller et le retour;
6. ajuster le corridor jusqu’à respecter la limite ou atteindre le nombre maximal d’essais;
7. joindre l’aller et le retour en une seule variante sans dupliquer inutilement le point de destination.

La proximité immédiate du départ et de la destination peut rendre certains segments communs inévitables. Dans ce cas, afficher un avertissement précis au lieu de prétendre que la contrainte est respectée.

### Régénération

Lorsqu’un utilisateur demande **Une autre route** :

- transmettre les segments ou le corridor de la route précédente au service;
- pénaliser ces segments;
- imposer un seuil de différence minimal;
- rejeter toute proposition dont le chevauchement avec la précédente dépasse 30 %, sauf impossibilité expliquée;
- conserver les autres critères de la demande initiale.

## 12. Calcul du chevauchement

Comparer des géométries brutes point par point est trop fragile. Les routes peuvent avoir des points légèrement différents tout en empruntant la même chaussée.

Approche recommandée :

1. découper les tracés en petits segments;
2. normaliser leur direction;
3. associer les segments proches dans une tolérance spatiale définie;
4. additionner la longueur des segments correspondants;
5. diviser par la longueur totale pertinente.

```ts
repeatedRoadPercent =
  (matchedSegmentDistanceKm / totalRouteDistanceKm) * 100;
```

Pour comparer l’aller et le retour, inverser la direction d’un segment ne doit pas empêcher sa détection comme route commune.

Documenter la tolérance géographique choisie et tester :

- le même tracé dans le même sens;
- le même tracé dans le sens inverse;
- deux routes parallèles distinctes;
- un court segment commun;
- des géométries de résolutions différentes;
- un tracé vide ou invalide.

## 13. Distance, tolérance et contraintes

Pour une cible `D` et une tolérance `T` :

```ts
const minDistanceKm = D * (1 - T / 100);
const maxDistanceKm = D * (1 + T / 100);
```

Un candidat est admissible si sa distance est comprise dans cet intervalle. Si aucun candidat n’est admissible :

1. ne pas élargir silencieusement la tolérance;
2. retourner le meilleur candidat facultatif comme suggestion;
3. indiquer sa distance et la contrainte non respectée;
4. proposer d’augmenter la tolérance.

Les contraintes strictes comme une frontière interdite ou une surface interdite ne doivent jamais être relâchées automatiquement.

## 14. Système de scores

Tous les scores sont compris entre 0 et 100. Chaque composante doit être calculable et testable indépendamment.

### Score de courbes

Peut considérer :

- la variation de cap par kilomètre;
- le nombre de virages significatifs;
- la densité de courbes;
- une pénalité pour les longues lignes droites;
- une pénalité pour les demi-tours artificiels.

### Score panoramique

Au MVP, ce score peut être approximatif et clairement identifié comme tel. Il peut considérer :

- la proximité de plans d’eau, parcs ou reliefs;
- les routes reconnues comme panoramiques dans la source de données;
- la proportion de routes rurales ou secondaires;
- une pénalité pour les zones autoroutières et industrielles.

Ne pas présenter une donnée inconnue comme une mesure précise.

### Score de routes secondaires

Calculer la proportion de distance sur des classes de route secondaires compatibles avec le style choisi.

### Score global

Les pondérations dépendent du style.

| Composante | Courbes | Panoramique | Touring |
| --- | ---: | ---: | ---: |
| Courbes | 45 % | 20 % | 20 % |
| Paysage | 20 % | 45 % | 20 % |
| Routes secondaires | 20 % | 20 % | 25 % |
| Conformité aux préférences | 15 % | 15 % | 20 % |
| Confort et efficacité | 0 % | 0 % | 15 % |

Après la moyenne pondérée, appliquer des pénalités explicites pour :

- la distance hors tolérance;
- les routes répétées;
- une proportion d’autoroute excessive;
- une surface inconnue ou interdite;
- un détour disproportionné.

Ne pas permettre à un excellent score de courbes de masquer une contrainte stricte non respectée.

## 15. Détection de variantes trop similaires

Avant de retourner trois propositions :

1. classer les candidats par score;
2. accepter le meilleur;
3. comparer chaque candidat suivant aux variantes déjà acceptées;
4. rejeter un candidat si son chevauchement dépasse le seuil configuré;
5. continuer jusqu’à trois variantes ou épuisement des candidats.

Si une seule variante est réellement distincte, en retourner une seule avec une explication. Ne pas dupliquer artificiellement des routes pour remplir l’écran.

## 16. Écrans du MVP

### Accueil — Nouveau trajet

Contenu :

- logo et courte promesse;
- champ de départ avec recherche d’adresse;
- bouton **Utiliser ma position**;
- choix du type de trajet;
- destination affichée seulement si nécessaire;
- distance cible;
- tolérance;
- style de ride;
- options autoroute et gravier;
- bouton principal **Générer ma ride**.

Le formulaire doit être utilisable au pouce sur mobile. Les choix importants utilisent des boutons ou cartes sélectionnables plutôt que de longues listes déroulantes.

### Chargement

Afficher les étapes compréhensibles :

- recherche des meilleurs corridors;
- vérification de la distance;
- comparaison des variantes.

Ne pas afficher une progression fictive en pourcentage si le serveur ne fournit pas une vraie progression.

### Résultats

Sur mobile :

- carte occupant la partie supérieure;
- panneau inférieur défilable;
- cartes de variantes;
- distance, durée, scores et avertissements;
- boutons **Choisir**, **Une autre route**, **Modifier** et **Sauvegarder**.

Sur ordinateur :

- formulaire ou résultats dans une colonne latérale;
- carte principale dans le reste de l’écran.

Chaque variante doit avoir une couleur accessible et un libellé, sans dépendre uniquement de la couleur.

### Détail d’une ride

- nom modifiable;
- carte;
- départ, destination et étapes;
- distance et durée;
- statistiques;
- avertissements;
- actions de sauvegarde et export GPX.

## 17. États d’interface obligatoires

Chaque écran asynchrone doit prévoir :

- état initial;
- chargement;
- succès;
- résultat partiel;
- aucun résultat;
- erreur du fournisseur;
- erreur de validation;
- expiration;
- mode hors ligne lorsque pertinent.

Messages recommandés :

- **Aucune route ne respecte cette distance.** Essayez une tolérance de 20 %.
- **Le retour utilise 14 % des mêmes routes.** Le réseau près de la destination limite les alternatives.
- **La surface de certains segments est inconnue.** Vérifiez le trajet avant le départ.
- **Le service de cartographie ne répond pas.** Réessayez dans quelques instants.

## 18. Accessibilité et expérience mobile

- respecter WCAG 2.2 niveau AA lorsque possible;
- rendre toutes les actions accessibles au clavier;
- fournir un libellé aux boutons icônes;
- conserver un contraste suffisant sur la carte et les panneaux;
- ne pas communiquer une information uniquement par couleur;
- utiliser des cibles tactiles d’au moins 44 × 44 px;
- gérer correctement le zoom du navigateur;
- ne pas bloquer l’orientation de l’appareil;
- annoncer les erreurs de formulaire aux technologies d’assistance;
- respecter la préférence de réduction des animations.

## 19. Sauvegarde locale

Créer une interface :

```ts
interface RideRepository {
  list(): Promise<SavedRide[]>;
  get(id: string): Promise<SavedRide | null>;
  save(ride: SavedRide): Promise<void>;
  delete(id: string): Promise<void>;
}
```

L’implémentation du MVP utilise `localStorage` avec :

- un schéma versionné;
- une validation Zod lors de la lecture;
- une migration ou une suppression contrôlée des données incompatibles;
- aucune clé secrète ni donnée inutilement sensible.

## 20. Modèle de données futur

Lorsque les comptes et la synchronisation sont ajoutés, prévoir les entités :

### `users`

- `id`;
- `email`;
- `display_name`;
- `created_at`;
- `updated_at`.

### `rides`

- `id`;
- `user_id`;
- `name`;
- `ride_type`;
- `style`;
- `request_json`;
- `geometry` de type géospatial;
- `distance_km`;
- `duration_minutes`;
- `scores_json`;
- `statistics_json`;
- `created_at`;
- `updated_at`.

### `ride_segments`

- `id`;
- `ride_id`;
- `sequence`;
- `geometry`;
- `road_name`;
- `road_class`;
- `surface`;
- `distance_km`;
- `duration_minutes`.

### `motorcycles`, plus tard

- `id`;
- `user_id`;
- `name`;
- `safe_range_km`;
- `preferred_style`;
- `allows_unpaved`.

Ajouter les politiques d’accès par utilisateur avant d’exposer une base distante.

## 21. Sécurité et vie privée

Les lieux de départ, destinations et historiques de déplacement sont sensibles.

- demander explicitement l’autorisation de géolocalisation;
- expliquer pourquoi la position est utilisée;
- ne pas demander la position en arrière-plan dans le MVP;
- ne pas journaliser les coordonnées exactes en production sauf nécessité documentée;
- arrondir ou supprimer les coordonnées dans les journaux;
- conserver les secrets uniquement côté serveur;
- limiter le débit des routes de géocodage et de génération;
- limiter la taille des corps de requête;
- valider les URL, identifiants et géométries;
- définir des délais d’expiration pour les appels externes;
- ne jamais rendre directement un message d’erreur brut du fournisseur;
- vérifier les licences et règles d’attribution des cartes et données routières;
- ajouter l’attribution cartographique exigée dans l’interface.

## 22. Résilience et performance

- annuler les recherches d’adresse obsolètes;
- mettre en cache uniquement ce que les conditions du fournisseur permettent;
- utiliser une clé de cache dérivée des paramètres normalisés;
- limiter le nombre de candidats et d’itérations;
- paralléliser les calculs de candidats lorsque le fournisseur le permet;
- limiter la concurrence pour respecter les quotas;
- utiliser un délai d’expiration et une stratégie de nouvelle tentative limitée;
- ne pas réessayer automatiquement une erreur de validation;
- simplifier les géométries seulement pour l’affichage, jamais avant les calculs critiques;
- charger la bibliothèque cartographique côté client seulement lorsque nécessaire.

Objectifs indicatifs du MVP :

- interface interactive rapidement sur un appareil mobile courant;
- suggestions d’adresse visibles en moins d’une seconde lorsque le fournisseur répond normalement;
- résultat de génération idéalement en moins de dix secondes;
- aucune action bloquée sans état de chargement ou possibilité d’annulation.

## 23. Observabilité

Créer un `requestId` pour chaque génération et journaliser des événements structurés :

- début et fin de génération;
- type de trajet;
- nombre de candidats demandés, reçus, rejetés et retournés;
- durée des appels externes;
- code d’erreur normalisé;
- contraintes non respectées;
- durée totale.

Ne pas journaliser par défaut :

- une adresse complète;
- des coordonnées exactes;
- une clé API;
- le corps complet d’une réponse externe.

Métriques utiles :

- taux de génération réussie;
- temps médian et au 95e percentile;
- taux de résultat unique ou vide;
- erreurs par fournisseur;
- distance moyenne hors tolérance;
- proportion de régénérations acceptées.

## 24. Stratégie de tests

### Tests unitaires

Tester au minimum :

- bornes de distance selon la tolérance;
- formule des scores et pondérations;
- pénalités;
- détection de segments communs;
- chevauchement dans les deux directions;
- élimination des variantes similaires;
- validation de chaque type de demande;
- transformation de la réponse du fournisseur;
- génération GPX et échappement XML;
- lecture et migration du stockage local.

### Tests de contrats

Utiliser des réponses de fournisseur enregistrées et anonymisées pour vérifier :

- les champs manquants;
- les surfaces inconnues;
- les routes vides;
- les géométries invalides;
- les erreurs et délais d’expiration;
- les changements de format importants.

### Tests de composants

- affichage conditionnel de la destination;
- erreurs de validation;
- sélection du style;
- chargement et erreurs;
- comparaison des variantes;
- avertissements de contraintes;
- navigation au clavier.

### Tests de bout en bout

Scénarios critiques :

1. générer une boucle de 250 km depuis Granby;
2. générer Granby → Mont-Tremblant;
3. générer un aller-retour différent;
4. demander une autre route;
5. sauvegarder et rouvrir une ride;
6. exporter un GPX;
7. gérer une absence de résultat;
8. gérer un fournisseur indisponible.

Les tests automatisés ne doivent pas dépendre d’un fournisseur externe réel ni d’un modèle de langage distant. Utiliser `MockRoutingProvider` ou `RagRoutingProvider` avec un corpus en mémoire et des données déterministes.

## 25. Variables d’environnement

Créer `.env.example` sans valeur secrète :

```dotenv
ROUTING_PROVIDER=mock
ROUTING_API_BASE_URL=
ROUTING_API_KEY=
GEOCODING_PROVIDER=mock
GEOCODING_API_BASE_URL=
GEOCODING_API_KEY=
NEXT_PUBLIC_MAP_STYLE_URL=
```

`GEOCODING_PROVIDER=mock` est la valeur locale et de test. `GEOCODING_PROVIDER=nominatim` exige `GEOCODING_API_BASE_URL` vers un service dédié ou géré ; aucun serveur public de démonstration n’est configuré par défaut. Les appels de géocodage, y compris le géocodage inverse, restent côté serveur derrière `GeocodingProvider`.

Valider les variables au démarrage. Les variables préfixées `NEXT_PUBLIC_` sont visibles dans le navigateur et ne doivent jamais contenir de secret.

## 26. Données simulées

Le développement initial doit fonctionner sans clé externe grâce à `MockRoutingProvider`. `RagRoutingProvider` (`ai-rag`) est un graphe local indexé, pas un réseau OSM : le mode simulé doit rester explicite.

Prévoir au moins :

- une boucle valide;
- une route vers une destination;
- un aller-retour avec peu de chevauchement;
- trois variantes distinctes;
- une réponse sans résultat;
- une réponse lente;
- une erreur fournisseur;
- une route contenant une portion d’autoroute;
- une route dont la surface est inconnue.

Le mode simulé doit être évident dans l’environnement de développement et impossible à confondre avec des données routières réelles en production.

## 27. Ordre d’implémentation

### Phase 0 — Initialisation

- créer le projet Next.js TypeScript;
- activer le mode strict;
- configurer formatage, lint et tests;
- créer `.env.example`;
- ajouter une validation automatisée dans l’intégration continue.

### Phase 1 — Domaine

- définir les types et schémas Zod;
- implémenter distance, contraintes, scores et chevauchement;
- écrire les tests unitaires;
- créer les interfaces de fournisseurs et de dépôt.

### Phase 2 — Prototype fonctionnel

- construire le formulaire;
- implémenter `MockRoutingProvider`;
- créer l’API de génération;
- afficher les variantes sans carte réelle si nécessaire;
- gérer tous les états d’erreur.

### Phase 3 — Carte

- intégrer MapLibre;
- afficher et différencier les variantes;
- ajuster automatiquement le cadrage;
- afficher départ, destination et points de passage;
- vérifier l’accessibilité des contrôles.

### Phase 4 — Fournisseur réel

- ~~choisir et documenter le fournisseur;~~ **OSRM pour le réseau routier réel; `mock` et `ai-rag` conservés hors ligne**;
- ~~implémenter un adaptateur de routage sur des routes OpenStreetMap;~~
- configurer une instance OSRM dédiée ou gérée pour la production;
- ancrer le RAG sur des arêtes de graphe + retrieval spatial (pas de courbe dilatée);
- faire remonter l’absence de corridors comme erreur métier (`FR-021`);
- GraphHopper, Valhalla ou un autre moteur reste remplaçable sans réécrire le domaine.

### Phase 5 — Sauvegarde et export

- implémenter `RideRepository` avec `localStorage`;
- créer la page de détail;
- générer et télécharger le GPX;
- tester la restauration des données.

### Phase 6 — Durcissement

- tests de bout en bout;
- audit mobile et accessibilité;
- limites de débit;
- observabilité;
- optimisation des performances;
- documentation de déploiement.

## 28. Critères d’acceptation du MVP

### Création

- L’utilisateur peut sélectionner les trois types de trajet.
- La destination est obligatoire uniquement pour `destination` et `round_trip`.
- La distance doit être positive et rester dans les limites configurées.
- Une erreur de formulaire indique clairement le champ à corriger.

### Génération

- Une demande valide retourne au moins une variante ou une erreur métier exploitable.
- Une boucle commence et termine près du même point.
- Une route de destination termine près de la destination demandée.
- Un aller-retour calcule et affiche le pourcentage de routes communes.
- Chaque contrainte non respectée est signalée.
- Deux variantes presque identiques ne sont pas présentées comme des choix différents.

### Carte

- La carte affiche le trajet complet.
- Le cadrage inclut toute la géométrie.
- La variante sélectionnée est identifiable sans dépendre uniquement de la couleur.
- Une erreur de chargement de carte ne fait pas perdre les résultats textuels.

### Sauvegarde et export

- Une ride sauvegardée peut être rouverte après rechargement de la page.
- Les données invalides dans le stockage local ne font pas planter l’application.
- Le GPX produit est valide et contient le tracé choisi.

### Qualité

- les vérifications de types réussissent;
- le lint réussit;
- les tests unitaires et de composants réussissent;
- les parcours critiques Playwright réussissent;
- aucun secret n’est commité;
- le projet peut démarrer à partir des instructions du dépôt.

## 29. Définition de « terminé » pour chaque tâche

Une tâche n’est terminée que si :

- le comportement demandé fonctionne;
- les états de chargement, vide et erreur sont traités;
- les entrées sont validées;
- les tests pertinents sont ajoutés ou mis à jour;
- le typage, le lint et les tests réussissent;
- l’interface fonctionne sur une largeur mobile;
- l’accessibilité de base est vérifiée;
- la documentation est mise à jour si le comportement change;
- aucun secret, journal sensible ou code mort n’est ajouté.

## 30. Décisions à confirmer avant la production

Cursor ne doit pas choisir silencieusement ces éléments :

- hébergement OSRM de production, zone OSM couverte, capacité et tarification — le serveur public n’est jamais configuré par défaut et ne convient qu’à des essais manuels à faible volume respectant sa politique d’utilisation;
- fournisseur de géocodage;
- fournisseur et licence des tuiles;
- zones géographiques officiellement prises en charge;
- limites minimales et maximales de distance;
- définition exacte d’une route non pavée;
- qualité et provenance du score panoramique;
- politique de conservation des trajets;
- authentification et stockage distant;
- hébergement et région des données;
- conditions d’utilisation et politique de confidentialité.

## 31. Première tâche recommandée à donner à Cursor

Utiliser le prompt suivant après avoir placé ce fichier à la racine du dépôt :

> Lis entièrement `README.md` et `CURSOR.md`. Commence uniquement par la Phase 0 et la Phase 1. Propose d’abord un court plan et la liste des fichiers à créer. Initialise l’application Next.js en TypeScript strict, configure le lint et les tests, puis implémente les types du domaine, les schémas Zod, le calcul des bornes de distance et leurs tests. N’intègre encore aucun fournisseur externe et ne construis pas l’interface complète. Termine en exécutant toutes les validations et en résumant les décisions prises.
