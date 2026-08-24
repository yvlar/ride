# Ride — Générateur de trajets moto

Ride est une application de planification d’itinéraires pensée pour les motocyclistes. Elle ne cherche pas seulement le chemin le plus rapide : elle génère une sortie agréable selon une distance ou un temps disponible, un style de conduite et des préférences de route.

## Vision du produit

L’utilisateur doit pouvoir créer une ride en quelques secondes à partir de :

- son point de départ;
- une destination facultative;
- une distance cible ou un temps disponible;
- un type de trajet;
- un style de route;
- des contraintes comme les autoroutes, le gravier, les péages ou la répétition de segments.

La proposition de valeur centrale est de produire des itinéraires adaptés au plaisir de rouler à moto, notamment des boucles d’une longueur donnée et des allers-retours empruntant des routes différentes.

## Types de trajets

### Boucle

L’utilisateur indique un départ et une distance cible. L’application génère une boucle qui revient au point de départ en limitant les routes parcourues plus d’une fois.

Exemple :

> Départ : Granby
> Distance : 250 km ± 10 %
> Style : panoramique
> Retour : Granby

### Départ vers destination

L’utilisateur saisit un départ, une destination et, au besoin, une distance ou une durée maximale. L’application privilégie une route intéressante plutôt que la route la plus rapide.

Exemple :

> Granby → Mont-Tremblant
> Style : sport / courbes
> Autoroutes : éviter

### Destination avec retour différent

L’utilisateur se rend à une destination, puis revient au point de départ par un autre corridor routier. Cette fonction doit minimiser les portions communes entre l’aller et le retour.

Exemple :

> Granby → Mont-Tremblant → Granby
> Distance maximale : 650 km
> Routes communes : maximum 10 %

## Paramètres de génération

### Distance ou durée

L’utilisateur peut définir :

- une distance cible avec une tolérance de ± 5 %, ± 10 % ou ± 20 %;
- une durée disponible, à partir de laquelle l’application estime une distance réaliste selon le type de route.

Des valeurs rapides peuvent être proposées : 100 km, 200 km, 300 km, 500 km ou une valeur personnalisée.

### Styles de trajet

| Style | Priorités |
| --- | --- |
| Sport / courbes | Routes sinueuses, relief, changements de direction et routes secondaires |
| Panoramique | Montagnes, lacs, rivières, belvédères, parcs et routes pittoresques |
| Touring | Confort, fluidité, bonne qualité routière et vitesse moyenne raisonnable |
| Adventure 80/20 | Majorité d’asphalte et jusqu’à 20 % de routes non pavées compatibles |
| Adventure 50/50 | Plus de gravier, chemins forestiers autorisés et routes secondaires non pavées |
| Découverte | Villages, cafés, restaurants, attractions et points de vue |
| Rapide | Destination prioritaire tout en limitant les autoroutes lorsque possible |

### Réglages avancés

- Autoroutes : autoriser, limiter, éviter ou interdire;
- routes non pavées : interdire, accepter occasionnellement, accepter modérément ou rechercher;
- routes répétées : définir un pourcentage maximal;
- péages et traversiers : autoriser ou éviter;
- frontières : rester au Canada ou permettre un passage aux États-Unis;
- difficulté : facile, intermédiaire ou technique.

## Résultats proposés

Une génération peut retourner trois variantes afin de laisser un vrai choix à l’utilisateur :

- la plus sinueuse;
- la plus panoramique;
- la plus rapide.

Chaque proposition présente au minimum :

- le tracé sur une carte;
- la distance et la durée estimées;
- les étapes principales;
- la proportion d’autoroute et de gravier;
- le pourcentage de routes répétées;
- un score global et des scores par critère.

Exemple de synthèse :

> **Ride Score : 87/100**
> Courbes : 92/100
> Paysages : 84/100
> Routes secondaires : 91/100
> Autoroute : 3 %
> Gravier : 0 %
> Routes répétées : 6 %

## Carte et modification du trajet

La carte interactive affiche le tracé, le sens du trajet, les étapes, les arrêts et les portions particulières comme le gravier ou l’autoroute. L’utilisateur peut déplacer, ajouter ou supprimer une étape avant de démarrer.

L’action **Une autre route** doit produire une variante réellement différente, par exemple en évitant au moins 70 % du trajet précédent, tout en conservant les critères sélectionnés.

## Arrêts et autonomie

L’application peut intégrer automatiquement des points d’intérêt :

- stations-service;
- restaurants et cafés;
- belvédères et attractions;
- parcs et toilettes;
- concessionnaires moto.

L’utilisateur peut demander une pause à intervalle régulier ou une station-service selon l’autonomie sécuritaire de sa moto. Un profil de moto pourra conserver cette autonomie ainsi que les préférences de route associées.

## Navigation, sauvegarde et partage

Après la génération, l’utilisateur peut :

- démarrer une navigation intégrée;
- exporter le trajet vers Google Maps, Apple Maps, Garmin ou un autre outil;
- télécharger un fichier GPX;
- sauvegarder, renommer, modifier ou dupliquer la ride;
- partager ou refaire une ride enregistrée.

L’historique permet à terme de favoriser les routes jamais parcourues et d’offrir une commande comme : **Montre-moi des routes que je n’ai jamais faites.**

## Mode « Surprise me »

Dans ce mode, l’utilisateur fournit seulement quelques contraintes :

> Départ : ma position
> Temps disponible : 4 heures
> Surface : 100 % route
> Autoroutes : interdites

L’application choisit la distance, le corridor et les étapes pour créer automatiquement une ride complète.

## Parcours utilisateur principal

1. Saisir le point de départ.
2. Choisir **Boucle**, **Destination** ou **Aller-retour différent**.
3. Indiquer la distance cible ou le temps disponible.
4. Choisir un style de ride et les options de route.
5. Appuyer sur **Générer ma ride**.
6. Comparer les variantes proposées sur la carte.
7. Modifier, régénérer, sauvegarder ou démarrer le trajet.

## Périmètre du MVP

La première version doit rester volontairement simple.

### Entrées

- départ;
- destination facultative;
- type : boucle, destination ou destination avec retour différent;
- distance cible;
- style : courbes, panoramique ou touring;
- options : éviter les autoroutes et éviter le gravier.

### Résultats

- carte et tracé;
- distance et durée estimées;
- statistiques essentielles;
- actions **Démarrer**, **Nouvelle route**, **Modifier** et **Sauvegarder**.

### Fonctions distinctives prioritaires

1. Générer une boucle proche d’une distance donnée.
2. Revenir d’une destination par une route différente.
3. Régénérer une variante qui diffère réellement du trajet précédent.

## Règles métier essentielles

- La distance générée doit respecter la tolérance choisie lorsque le réseau routier le permet.
- Un aller-retour différent doit respecter le pourcentage maximal de segments communs.
- Les segments interdits par les préférences de surface, de frontière ou d’autoroute ne doivent pas être proposés.
- Si toutes les contraintes sont incompatibles, l’application doit l’expliquer et suggérer les assouplissements les plus utiles.
- Les variantes doivent être suffisamment distinctes pour représenter de vrais choix.
- Les estimations de durée doivent tenir compte du type de route, des pauses et des arrêts ajoutés.

## Feuille de route proposée

### Sprint 1 — Générateur de base

- trois types de trajets;
- distance cible et tolérance;
- trois styles de ride;
- options autoroute et gravier;
- carte, distance et durée;
- sauvegarde simple.

### Sprint 2 — Qualité des variantes

- plusieurs propositions par génération;
- score de courbes et score panoramique;
- mesure des segments répétés;
- régénération réellement différente.

### Sprint 3 — Arrêts intelligents

- points d’intérêt;
- pauses automatiques;
- gestion de l’autonomie et stations-service.

### Versions suivantes

- export GPX et intégrations de navigation;
- profils de motos;
- historique des routes parcourues;
- recommandation de routes inédites;
- partage de rides;
- mode « Surprise me ».

## Développement

Prérequis : Node.js 22 ou plus récent.

```bash
cp .env.example .env.local
npm ci
npm run dev
```

L’application démarre sur [http://localhost:3000](http://localhost:3000). Le fichier `.env.example` conserve `ROUTING_PROVIDER=mock` et `GEOCODING_PROVIDER=mock` afin que le démarrage local et les tests ne sollicitent aucun service partagé.

Pour suivre les routes OpenStreetMap réelles, définir `ROUTING_PROVIDER=osrm` et `ROUTING_API_BASE_URL` vers une instance OSRM dédiée ou gérée dans chaque environnement Vercel visé. Le serveur public de démonstration n’est jamais configuré par défaut. `ROUTING_PROVIDER=ai-rag` reste disponible pour le graphe local indexé; ce n’est pas un réseau OSM.

Pour le géocodage inverse de « Ma position », `GEOCODING_PROVIDER=mock` reste la valeur locale et de test. Un adaptateur Nominatim compatible (`GEOCODING_PROVIDER=nominatim`) peut être activé en définissant `GEOCODING_API_BASE_URL` vers un service dédié ou géré. `GEOCODING_API_KEY` est facultative. Aucun serveur public de démonstration n’est configuré par défaut. Les appels passent uniquement par le serveur, via `GeocodingProvider.reverse()`.

Le suivi GPS de la carte (`FR-022`) est volontaire, limité au premier plan, et n’est pas à lui seul une navigation virage par virage. Aucune position n’est conservée ni demandée en arrière-plan.

La navigation virage par virage (`FR-023` à `FR-026`) démarre après **Démarrer la navigation** : instructions visuelles, guidage vocal et recalcul hors trajet. Sur le web et l’iPhone, elle exige que l’application reste ouverte au premier plan. Sur un écran Apple CarPlay connecté, la même session s’affiche avec un chrome type carte de navigation (`FR-028`). La localisation en arrière-plan (permission Always), la navigation hors ligne, Android Auto et l’export GPX restent hors périmètre.

La coque iOS Capacitor (`FR-027`) encapsule la même application web. Le domaine et les API Next.js ne changent pas. Ce dépôt fournit le projet Xcode dans `ios/` ; la compilation, le simulateur et TestFlight exigent macOS et Xcode. Cet environnement Linux ne produit pas d’IPA.

L’aperçu et la navigation partagent une seule carte routière. Démarrer la navigation agrandit cette carte et passe en vue 3D cap-en-haut (`FR-024`) au lieu d’en monter une seconde, ce qui évite le plantage mémoire iOS suivi dans [MapLibre GL JS #7667](https://github.com/maplibre/maplibre-gl-js/issues/7667) tout en gardant le tracé aligné sur les rues (`FR-013`). Le repli raster OSM reste plat ; un `NEXT_PUBLIC_MAP_STYLE_URL` vectoriel avec une couche `building` affiche les volumes.

Commandes utiles :

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run lint` | ESLint |
| `npm run typecheck` | Vérification TypeScript |
| `npm test` | Tests Vitest |
| `npm run build` | Build de production |
| `npm run cap:sync` | Copie la config Capacitor vers le projet iOS |
| `npm run cap:ios` | Ouvre le projet dans Xcode (macOS uniquement) |

### Application iOS (FR-027)

Prérequis sur un Mac : Xcode, CocoaPods, un iPhone simulateur ou physique.

1. Démarrer Next.js (`npm run dev`) ou déployer l’app.
2. Définir `CAPACITOR_SERVER_URL` vers cette origine (exemple local : `http://192.168.1.10:3000`).
3. `npx cap sync ios` puis `npx cap open ios`.
4. Dans Xcode, lancer Ride. Accorder la localisation **lorsque l’app est utilisée**.

`Info.plist` autorise uniquement le réseau local (`NSAllowsLocalNetworking`) pour un `CAPACITOR_SERVER_URL` en `http://` sur le LAN. ATS reste actif pour Internet. Une origine `https://` de production n’a pas besoin de cleartext.

Sans `CAPACITOR_SERVER_URL`, l’app affiche le placeholder `public/index.html`. Android, la publication App Store et une réécriture Swift / React Native de l’app iPhone restent hors MVP.

### Apple CarPlay (FR-028)

Après **Démarrer la navigation**, Ride affiche la session sur CarPlay si un écran véhicule est connecté. Le WebView n’est pas mirroiré : une scène native `CPMapTemplate` dessine le tracé (MapKit) et lit le guidage via une synthèse locale.

Cet environnement Linux ne compile pas Xcode et ne lance pas le simulateur CarPlay.

Sur un Mac, après `npx cap sync ios` et l’ouverture Xcode :

1. Demander l’entitlement Navigation CarPlay (`com.apple.developer.carplay-maps`) via [developer.apple.com/contact/carplay](https://developer.apple.com/contact/carplay/). Sans cette approbation Apple, l’icône n’apparaît pas dans CarPlay.
2. I/O → External Displays → CarPlay du simulateur iOS, ou un véhicule compatible.
3. Générer un trajet dans Ride, puis **Démarrer la navigation**.
4. Vérifier la bannière de manœuvre, le tracé, l’ETA, Muet / Recentrer, et que la session continue si l’iPhone est verrouillé tant que CarPlay reste connecté.

Le guidage iPhone reste `speechSynthesis`. Lorsque CarPlay possède la voix, l’iPhone ne double pas l’annonce.

Le cahier des charges technique est dans `CURSOR.md`.

## Critères de succès du MVP

- Un utilisateur peut créer un trajet en moins d’une minute.
- Une boucle respecte généralement la distance cible et sa tolérance.
- L’aller et le retour utilisent des corridors visiblement différents.
- Les préférences d’autoroute et de gravier sont respectées.
- Une nouvelle génération propose un itinéraire sensiblement différent.
- Le résultat est compréhensible et modifiable avant le départ.
