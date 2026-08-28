# Architecture CarPlay et cible native

**Statut :** contrat d’architecture, pas une certification Apple  
**Exigences liées :** `FR-027`, `FR-028`, `NFR-006`, `NFR-007`, `BR-004`

Ce document distingue clairement **l’expérience iPhone / PWA** de **la véritable intégration Apple CarPlay**. Ride n’est pas « compatible CarPlay » du seul fait qu’il s’affiche sur un téléphone.

## 1. Cible produit actuelle

Ride est aujourd’hui :

1. une **application web** Next.js (PWA possible via Safari / `apple-web-app`);
2. une **coque iOS Capacitor** (`ios/`, `FR-027`) qui charge cette webview au premier plan;
3. un **adaptateur CarPlay natif** (`ios/App/App/CarPlay/`) qui n’affiche **pas** la WebView.

La PWA **n’est pas** une app CarPlay. Un navigateur, un manifeste web ou une imitation CSS de l’UI véhicule ne peuvent pas parler à `CPMapTemplate`.

## 2. Séparation des couches

```text
Domaine (recherche, trajet, progression, hors-trajet, voix texte)
        ↓
Application (génération, recalcul, session)
        ↓
Ports
  • CarPlayDisplay          afficheur véhicule (infrastructure)
  • LocationWatch           GPS de premier plan
  • SpeechGuidance          voix iPhone (Web Speech)
        ↓
Adaptateurs
  • Capacitor + WKWebView   iPhone
  • RideCarPlayPlugin       pont JSON vers Swift
  • CPMapTemplate / MapKit  écran véhicule
```

Le domaine ne référence ni Capacitor, ni CarPlay, ni MapKit (`BR-004`, `NFR-007`).

## 3. Contrats entre le moteur de navigation et CarPlay

Le moteur iPhone calcule :

- la projection sur le tracé;
- la prochaine manœuvre (`CPManeuver`);
- les estimations (`CPTravelEstimates`);
- le hors-trajet et le recalcul;
- le texte d’annonce.

L’adaptateur CarPlay reçoit un **instantané JSON** (`CarPlaySessionSnapshot`) :

| Champ | Usage CarPlay |
| --- | --- |
| `routeId` + `coordinates` | `CPTrip` / tracé MapKit |
| `maneuver` | `CPManeuver` + symbole système |
| `remainingDistanceKm` / `remainingDurationMinutes` | `CPTravelEstimates` |
| `speakText` / `cancelSpeech` | synthèse locale véhicule |
| `muted` | bouton Muet / Son |
| `userLocation` / `headingDeg` | caméra 3D cap-en-haut |

CarPlay **n’est pas** un second moteur. Il n’invente pas de géométrie.

Templates officiels visés :

- `CPMapTemplate` — racine de l’app de navigation;
- `CPSearchTemplate` — recherche autorisée par CarPlay (lieux déjà connus / requête transmise à l’iPhone);
- `CPListTemplate` — récents, favoris, trajets enregistrés, reprise;
- `CPTrip` + `CPRouteChoice` — proposition déjà calculée sur l’iPhone;
- `CPNavigationSession` + `CPManeuver` + `CPTravelEstimates` — guidage.

La planification complexe d’une boucle (distance, style, RAG) se fait **sur l’iPhone avant le départ**. CarPlay reprend un trajet prêt.

## 4. Demande d’autorisation Apple

L’entitlement `com.apple.developer.carplay-maps` est présent dans le dépôt. Il **ne suffit pas** à publier :

1. compte Apple Developer avec l’app Navigation;
2. demande d’entitlement CarPlay Maps auprès d’Apple;
3. provisioning + compilation **sur macOS / Xcode**;
4. tests simulateur CarPlay (Hardware → CarPlay);
5. revue App Store (hors MVP de publication).

Sans l’approbation Apple, le code compile en local avec un Mac mais **n’apparaît pas** sur un véhicule réel.

## 5. Étapes d’implémentation restantes

Déjà dans le dépôt : scène CarPlay, `CPMapTemplate`, `CPListTemplate` (Trajets : reprise, récents, enregistrés), `CPSearchTemplate` (filtre des lieux déjà connus), session de navigation, voix véhicule, boutons Arrêter / Muet / Recentrer / recherche, pont Capacitor `setCatalog` / `catalogSelect`.

À poursuivre côté natif (Mac requis) :

1. round-trip de recherche : attendre les résultats de géocodage iPhone avant `completionHandler` de `CPSearchTemplate`;
2. `CPRouteChoice` lorsque plusieurs propositions existent (hors MVP actuel : une proposition);
3. vérifier écran verrouillé **uniquement** tant que la scène CarPlay reste connectée;
4. tests simulateur CarPlay (Hardware → CarPlay) sur un Mac.

Côté web : le chrome iPhone reste la source de planification. Aucune page `/carplay` n’est une intégration véhicule.

## 6. Refonte UX navigation (`FR-042`) — ce que CarPlay partage et ce qu’il ignore

La refonte de l’écran de navigation iPhone **n’ajoute aucun second moteur**. Elle
enrichit le modèle partagé, et l’afficheur véhicule reste volontairement plus
pauvre que le téléphone (interactions limitées en roulant).

| Donnée | iPhone | CarPlay |
| --- | --- | --- |
| Prochaine manœuvre + distance | oui | oui (`CPManeuver`) |
| Manœuvre suivante (`NavigationProgress.followingStep`) | oui, en ligne discrète | **non** — une seule manœuvre à l’écran |
| Heure d’arrivée / temps / distance restants | oui | oui (`CPTravelEstimates`) |
| Portion parcourue vs restante (`splitLineStringAtKm`) | oui, tracé estompé | **non** — MapKit dessine le `CPTrip` complet |
| Bandeau d’état (`deriveNavigationStatus`) | oui | **non** — CarPlay garde ses alertes système |
| Suivi caméra suspendu / recentrage | oui | bouton natif « Recentrer » déjà présent |
| Muet / Terminer | oui | oui (déjà ponté) |

`followingStep` transite donc dans le domaine mais **n’est pas** ajouté à
`CarPlaySessionSnapshot` : l’ajouter afficherait deux manœuvres sur un écran
véhicule, ce que la revue Apple et la sécurité en mouvement déconseillent.

Le démarrage et l’arrêt restent synchronisés par le même `CarPlayDisplay`
(`start` / `update` / `stop`, événements `connection` / `mute` / `stop`). Une
demande de nouveau trajet pendant une session active passe désormais par une
confirmation explicite côté iPhone plutôt que par un arrêt silencieux.

### Limites restantes (inchangées, à valider sur macOS)

Rien dans cette refonte n’a pu être compilé ni testé sur un appareil ou un
simulateur CarPlay : ce dépôt n’a pas d’environnement macOS/Xcode. Restent donc
non vérifiés côté natif :

1. le rendu réel de `CPManeuver` / `CPTravelEstimates` avec les nouveaux libellés;
2. la demande d’entitlement CarPlay Maps auprès d’Apple (section 4);
3. les tests simulateur CarPlay (Hardware → CarPlay);
4. la revue App Store.

## 7. Ce que Ride ne prétend pas

- La PWA n’est pas compatible CarPlay.
- Le verrouillage iPhone sans scène CarPlay n’entretient pas le GPS (`NFR-006`).
- Android Auto est hors périmètre.
- Une imitation visuelle de CarPlay dans le navigateur est interdite.
