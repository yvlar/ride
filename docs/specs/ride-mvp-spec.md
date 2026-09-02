# Ride — Spécification fonctionnelle du MVP

**Statut :** source de vérité fonctionnelle  
**Identifiants :** `FR-xxx` (exigence fonctionnelle), `BR-xxx` (règle métier), `NFR-xxx` (exigence non fonctionnelle)

Ce document est le contrat fonctionnel de l’application Ride. Avant de planifier, coder, refactorer, déboguer ou reviewer une fonctionnalité, Cursor et les contributeurs doivent lire les sections pertinentes et référencer les identifiants d’exigences concernés.

Le fichier `CURSOR.md` reste le cahier des charges **technique** (pile, architecture de dossiers, contrats d’API, stratégie de tests). Le fichier `README.md` reste la vue d’ensemble produit et le guide de démarrage. En cas d’écart sur le **comportement produit du MVP**, ce document prévaut.

---

## 1. Vision du produit

Ride est une application de planification d’itinéraires pour motocyclistes. Elle ne cherche pas le chemin le plus rapide par défaut. Elle génère une sortie agréable à partir d’un départ, d’une destination facultative, d’une distance ou d’une durée, d’un type de trajet, d’un style de conduite et de préférences de route.

La proposition de valeur du MVP est de produire, en peu d’étapes, un trajet moto utile :

- une **boucle** d’une longueur approximativement demandée;
- un **trajet vers une destination** qui privilégie le style de conduite plutôt que la vitesse;
- un **aller-retour** dont le retour emprunte un corridor aussi différent que raisonnablement possible.

Le plaisir de rouler — courbes, paysages, fluidité — prime sur l’optimisation purement temporelle.

---

## 2. Objectifs du MVP

Le MVP se limite au **flux central de génération de trajet**. Un utilisateur doit pouvoir :

1. indiquer un point de départ par recherche de lieu ou par la position actuelle, avec l’adresse affichée;
2. choisir un type de trajet parmi les trois modes ci-dessous;
3. indiquer une destination lorsque le type l’exige;
4. indiquer une distance cible et/ou une durée disponible;
5. choisir un style de trajet;
6. activer les préférences d’évitement d’autoroutes, de routes non pavées, et l’option « Canada seulement »;
7. générer un trajet;
8. le visualiser sur une carte avec les statistiques essentielles;
9. régénérer une variante sensiblement différente;
10. suivre sa position actuelle sur la carte, uniquement au premier plan et après une action volontaire (`FR-022`);
11. démarrer une navigation virage par virage de premier plan, avec instructions, guidage vocal et recalcul hors trajet (`FR-023`, `FR-024`, `FR-025`, `FR-026`), sur un écran lisible d’un coup d’œil en roulant (`FR-042`);
12. ouvrir le même flux depuis une coque iOS installable (`FR-027`), sans changer les règles métier;
13. poursuivre la même navigation sur Apple CarPlay lorsqu’un écran véhicule est connecté (`FR-028`);
14. enregistrer le parcours réellement effectué et l’exporter en fichier GPX (`FR-041`).

Le succès du MVP se mesure à la capacité de produire un trajet compréhensible, conforme aux contraintes autant que le réseau routier le permet, avant le départ. La navigation assistée, une fois le trajet généré, reste limitée au premier plan sur l’iPhone, sauf exception CarPlay (`FR-028`).

---

## 3. Indépendance des fournisseurs

### BR-004 — Indépendance du domaine vis-à-vis des fournisseurs

La logique métier de Ride — types de trajets, styles, tolérance de distance, minimisation des routes répétées, préférences d’évitement — **ne doit pas dépendre d’un fournisseur cartographique ou de routage particulier**.

Le domaine ne doit pas supposer que le projet utilise de façon permanente :

- Google Maps;
- Mapbox;
- HERE;
- OpenStreetMap;
- GraphHopper;
- Valhalla;
- OSRM;
- un index RAG, un modèle de langage ou un corpus nommé;
- ni tout autre fournisseur spécifique de carte, de géocodage ou de routage.

Les fournisseurs sont des **détails d’implémentation**. Ils sont accessibles uniquement via des adaptateurs remplaçables. Un changement de fournisseur ne doit pas obliger à réécrire les règles métier.

Cette règle s’applique également aux tuiles, au géocodage, à un pipeline RAG et à toute API externe utilisée pour afficher ou calculer un trajet.

---

## 4. Types de trajets

Le MVP prend en charge exactement trois types de trajets.

### FR-001 — Boucle

L’utilisateur fournit un point de départ et une distance cible (ou une durée disponible convertie en distance selon `BR-005`).

Le système doit générer un trajet qui :

- commence au point de départ;
- revient au point de départ;
- respecte autant que possible la distance cible selon `BR-001`;
- minimise la répétition des mêmes routes selon `BR-002`.

Le tracé final doit suivre le réseau routier réel. Une boucle géométrique parfaite n’est pas un résultat acceptable.

### FR-002 — Départ vers destination

L’utilisateur fournit un point de départ et une destination.

Le système doit générer un trajet moto entre ces deux points. Le trajet doit **prioriser le style de conduite demandé** (`FR-004`, `FR-005` ou `FR-006`) plutôt que de choisir automatiquement la route la plus rapide.

Une distance cible ou une durée maximale peut être fournie. Lorsqu’elle l’est, le système vise cette contrainte selon `BR-001` sans produire un détour disproportionné par rapport au style demandé.

### FR-003 — Départ vers destination avec retour par une route différente

L’utilisateur fournit un point de départ et une destination.

Le système doit générer un trajet :

`Départ → Destination → Départ`

Le retour doit tenter de différer **significativement** de l’aller. Le système doit minimiser les segments routiers dupliqués lorsque c’est raisonnablement possible (`BR-002`).

La proximité immédiate du départ ou de la destination peut rendre certains segments communs inévitables. Dans ce cas, le système doit l’indiquer clairement plutôt que de prétendre que l’aller et le retour sont entièrement distincts.

---

## 5. Distance cible, tolérance et durée disponible

### FR-009 — Distance cible

L’utilisateur peut fournir une distance cible en kilomètres.

La distance cible est **obligatoire** pour une boucle (`FR-001`) lorsqu’aucune durée disponible n’est fournie. Elle est **facultative** pour un trajet vers une destination (`FR-002`) et pour un aller-retour (`FR-003`).

Les unités doivent rester explicites : la distance métier s’exprime en kilomètres.

### BR-001 — Tolérance de distance

Pour le MVP, la distance générée doit viser une tolérance de **±10 %** autour de la distance demandée (ou de la distance estimée à partir de la durée, voir `BR-005`).

Formule :

```text
distance_min_km = distance_demandée_km × 0,90
distance_max_km = distance_demandée_km × 1,10
```

Un trajet est conforme à cette règle s’il se situe dans cet intervalle, **sauf** si aucun trajet techniquement valide ne peut raisonnablement le satisfaire. Dans ce cas, le système ne doit pas élargir silencieusement la tolérance : il doit expliquer l’écart et, si possible, proposer le meilleur candidat hors intervalle avec sa distance réelle.

### FR-010 — Durée disponible

L’utilisateur peut fournir une durée disponible plutôt qu’une distance, ou en complément d’une distance.

Lorsque seule la durée est fournie, le système estime une distance cible réaliste puis génère le trajet selon cette distance.

Lorsque durée et distance sont fournies toutes les deux, la distance cible reste la contrainte principale de longueur (`BR-001`). La durée sert de contrainte de plafond : un trajet dont la durée estimée dépasse nettement la durée disponible doit être signalé.

### BR-005 — Conversion durée → distance estimée

La conversion d’une durée disponible en distance cible doit tenir compte du style de trajet :

- **Curvy** : vitesse moyenne plus basse, plus de virages;
- **Scenic** : vitesse moyenne modérée, routes rurales;
- **Touring** : vitesse moyenne plus élevée, routes plus fluides.
- **Fastest** : vitesse moyenne la plus élevée, trajet classé par temps estimé.

Cette conversion appartient au domaine. Elle ne doit pas être déléguée implicitement à un fournisseur de routage. Les constantes de vitesse utilisées pour l’estimation doivent rester ajustables sans changer d’adaptateur externe.

---

## 6. Styles de trajet

Le MVP prend en charge quatre styles. L’utilisateur en choisit un avant la génération (`FR-019`).

### FR-004 — Curvy

Prioriser :

- les routes sinueuses;
- les routes secondaires;
- les changements d’élévation;
- les changements de direction fréquents.

Éviter les longues lignes droites et les corridors autoroutiers lorsque des alternatives raisonnables existent.

### FR-005 — Scenic

Prioriser :

- les routes rurales;
- les montagnes;
- les lacs;
- les rivières;
- les points de vue;
- les villages;
- les corridors panoramiques.

Le caractère panoramique peut être approximatif au MVP, mais il ne doit jamais être présenté comme une mesure précise s’il repose sur une heuristique.

### FR-006 — Touring

Prioriser :

- les routes confortables;
- une conduite fluide;
- une vitesse de déplacement raisonnable;
- les routes secondaires de bonne qualité lorsque c’est approprié.

Le touring n’est pas un mode « le plus rapide ». Il reste un trajet moto agréable, plus stable et moins technique que Curvy.

### Style Fastest

Prioriser le candidat viable dont le temps de parcours estimé est le plus court. Les autoroutes sont permises lorsque **Éviter les autoroutes** est désactivé. Lorsque cette préférence est activée, le moteur choisit d’abord une alternative raisonnable sans autoroute, puis minimise le temps dans ce vivier.

### FR-019 — Choix du style de trajet

L’écran principal doit permettre de choisir un et un seul style parmi Curvy, Scenic, Touring et Fastest avant la génération. **Réglages** expose également un choix simplifié **Panoramique** ou **Le plus rapide** pour les flux rapides de la carte. Le style sélectionné oriente le classement et la construction du trajet.

### BR-003 — Priorité du style sur la route la plus rapide

Sauf demande explicite du style **Fastest**, le générateur ne doit pas réduire le problème à un plus court chemin temporel. Le style demandé (`FR-004`, `FR-005` ou `FR-006`) guide la sélection des corridors, y compris si le résultat n’est pas le plus rapide. Avec **Fastest**, les contraintes de viabilité et les préférences explicites restent prioritaires, puis le temps estimé départage les candidats.

---

## 7. Préférences de route

### FR-007 — Éviter les autoroutes

L’utilisateur peut demander que les autoroutes soient évitées lorsqu’une alternative raisonnable existe.

« Raisonnable » signifie qu’une alternative n’impose pas un détour disproportionné, une rupture d’itinéraire ou l’impossibilité de clôturer le type de trajet demandé. Si aucune alternative raisonnable n’existe, le système peut emprunter un segment d’autoroute et doit le signaler.

### FR-008 — Éviter les routes non pavées

L’utilisateur peut demander que les routes **connues** comme non pavées soient exclues du trajet généré.

Les segments dont la surface est inconnue ne doivent pas être présentés comme pavés. S’ils sont inclus, le système doit indiquer que la surface de certains segments est inconnue.

### BR-007 — Pas de relâchement silencieux des contraintes de surface connues

Une route connue comme non pavée ne doit pas être proposée lorsque `FR-008` est actif. Si cette contrainte rend la génération impossible, le système l’explique et suggère l’assouplissement le plus utile. Il ne doit pas ignorer silencieusement l’exclusion.

### FR-030 — Canada seulement

L’utilisateur peut demander que le trajet reste **au Canada** et **ne traverse pas aux États-Unis**.

Lorsque l’option est active :

- le départ doit être au Canada;
- la destination, si le type de trajet en exige une, doit être au Canada;
- **toute** la géométrie du trajet généré (y compris ponts, boucles et raccourcis) doit rester hors des États-Unis.

La classification Canada / États-Unis est un fait géographique du domaine. Elle ne lit pas le pays renvoyé par un géocodeur et ne dépend d’aucun fournisseur de carte ou de routage nommé (`BR-004`).

L’option est **facultative** et **désactivée par défaut**.

### BR-009 — Pas de relâchement silencieux du passage aux États-Unis

Un segment, un pont ou un corridor qui entre aux États-Unis ne doit pas être proposé lorsque `FR-030` est actif. Si cette contrainte rend la génération impossible — y compris lorsque le départ ou la destination est déjà aux États-Unis — le système l’explique et suggère l’assouplissement le plus utile (désactiver l’option, ou choisir un départ et une destination au Canada). Il ne doit pas ignorer silencieusement le passage de frontière.

### BR-010 — Géométrie GPX autoritaire

Une trace ou une route GPX importée (`FR-039`) reste la référence de navigation. Un fournisseur de routage ne doit pas la remplacer par un autre chemin plus rapide. Il n’est utilisé que pour rejoindre le point d’entrée, revenir sur la portion restante après une sortie, ou accrocher une route `<rte>` sans réordonner ses points.

---

## 8. Génération et régénération

### FR-011 — Génération de trajet

À partir d’une demande valide, le système génère un trajet conforme au type, au style et aux préférences.

La génération doit :

1. valider la demande;
2. produire un ou plusieurs candidats internes;
3. normaliser le résultat en un trajet du domaine (géométrie, distance, durée, statistiques);
4. vérifier les règles métier (`BR-001`, `BR-002`, `BR-003`, `BR-007`, `BR-009`);
5. retourner un trajet utilisable **ou** une erreur métier explicite.

Le MVP affiche **un trajet principal** à la fois. La comparaison de plusieurs variantes simultanées n’est pas requise dans ce périmètre.

Le domaine évalue les candidats. Le fournisseur de routage calcule des chemins; il ne décide pas des règles métier. Un adaptateur RAG récupère des corridors connus, en déduit des points de passage, puis s’appuie sur l’adaptateur de réseau routier configuré pour le tracé affiché : il reste un calculateur de chemins, pas un moteur de règles. L’utilisateur peut le demander à la requête via `FR-029`.

### FR-012 — Régénération

L’utilisateur peut demander une nouvelle route à partir des mêmes critères.

La régénération doit :

- conserver le type, le style, les points, les préférences et l’option de corridors connus (`FR-029`) de la demande initiale;
- tenter de produire un corridor **sensiblement différent** du trajet précédent;
- rester soumise à `BR-001`, `BR-002` et aux préférences d’évitement.

### FR-029 — Option de génération par corridors connus (RAG)

L’utilisateur peut activer une option facultative, **désactivée par défaut**, pour générer le trajet via l’adaptateur de routage par connaissance (`NFR-005`), qui classe des corridors puis s’appuie sur le fournisseur de réseau routier configuré par l’environnement pour le tracé final.

Lorsque l’option est active :

- la génération (`FR-011`), la régénération (`FR-012`) et le recalcul (`FR-026`) utilisent le même adaptateur de connaissance pour classer et relier des corridors;
- le formulaire reste celui de `FR-014` : départ, type, destination le cas échéant, distance ou durée, style et préférences d’évitement;
- l’option ne choisit pas une destination à la place de l’utilisateur et n’est pas une recommandation de sorties;
- l’adaptateur indexe un graphe routier local, classe les corridors via un modèle de chat appelé **côté serveur** avec une clé API, puis en déduit des points de passage ; il n’invente pas de coordonnées;
- le **tracé affiché et navigable** est produit par l’adaptateur de réseau routier configuré (`ROUTING_PROVIDER`) à partir de ces points de passage, afin de suivre le réseau réel lorsque celui-ci est branché (`FR-001`, `FR-002`, `FR-003`);
- tant qu’aucun réseau réel n’est branché, le mode simulé reste explicite (géométrie du graphe local);
- une clé API absente ou un échec du modèle produit une erreur explicite (`PROVIDER_ERROR`);
- si aucun corridor connu ne relie la demande, le système renvoie une erreur métier explicite (`FR-021`).

Lorsque l’option est inactive, le comportement actuel est inchangé (`ROUTING_PROVIDER`).

L’écran présente l’option sous le libellé **« Corridors RAG »**, avec une mention claire que le classement des corridors passe par **ChatGPT** via une **clé API serveur**, et que le tracé suit le réseau routier configuré. Le domaine ne nomme pas le fournisseur de modèle (`BR-004`).

### BR-006 — Différence minimale à la régénération

Une régénération ne doit pas se limiter à un micro-ajustement du même corridor. Le système doit tenter de minimiser le réemploi des segments du trajet précédent.

Le seuil exact de différence peut évoluer. Pour le MVP, une régénération est acceptable si l’utilisateur peut constater un corridor visiblement différent, sauf impossibilité expliquée du réseau routier.

### FR-021 — Contraintes incompatibles

Si aucune route ne respecte l’ensemble des contraintes, le système doit :

- l’expliquer en langage clair;
- indiquer la ou les contraintes en cause (distance, autoroutes, surface, passage aux États-Unis, chevauchement, etc.);
- suggérer les assouplissements les plus utiles.

Il ne doit pas renvoyer un échec opaque ni un trajet qui viole silencieusement une contrainte stricte.

---

## 9. Carte

### FR-013 — Carte

Après une génération réussie, l’application affiche le trajet sur une carte.

La carte du MVP doit :

- montrer le tracé complet;
- cadrer l’ensemble de la géométrie;
- indiquer le départ et, le cas échéant, la destination;
- permettre d’identifier le sens général du trajet;
- rester lisible sur un smartphone (`NFR-001`).

L’écran résultat cadre le trajet en **vue de dessus**. La vue 3D cap-en-haut n’est activée que pendant une navigation suivie (`FR-024`).

La carte est un moyen d’affichage. Le composant cartographique, les tuiles et le SDK utilisés sont des détails d’infrastructure (`BR-004`, `NFR-005`). Une indisponibilité de la carte ou du suivi GPS ne doit pas faire disparaître les informations textuelles du résultat (distance, durée, avertissements).

La modification interactive avancée du tracé (ajout, déplacement ou suppression d’étapes) n’est pas requise dans le MVP.

### FR-022 — Suivi GPS de premier plan

Après une génération réussie, l’utilisateur peut afficher et suivre sa position actuelle sur la carte.

La position actuelle est affichée comme une **icône de moto**. Lorsque le cap GPS est connu, la moto est orientée dans le sens du déplacement ; sinon elle conserve le dernier cap valide.

Le contrôle « Suivre ma position » centre et suit la moto en temps réel tant qu’il est actif, carte **nord en haut**. Ce suivi n’affiche aucune instruction de manœuvre et ne constitue pas une navigation virage par virage (`FR-023`).

Le suivi GPS :

- est **volontaire** : il commence uniquement lorsque l’utilisateur active le contrôle de localisation;
- fonctionne uniquement lorsque l’application est ouverte au **premier plan**;
- ne conserve aucune position (ni base de données, ni `localStorage`, ni cookie, ni journal);
- ne partage aucune position avec un tiers au-delà de l’appel serveur de géocodage inverse effectué une seule fois lors du choix de « Ma position » (`FR-017`);
- ne constitue **pas** à lui seul une navigation virage par virage (`FR-023`);
- ne demande aucune permission de localisation en arrière-plan.

La permission de géolocalisation n’est demandée qu’après une action explicite : le bouton « Ma position », le contrôle GPS de la carte, l’ouverture du flux **Décrire mon trajet** (`FR-034`), l’ouverture du volet **Trouver une destination** (`FR-038`), ou **Démarrer la navigation** sur un trajet GPX importé (`FR-039`). L’importation du fichier elle-même ne demande pas la position. Aucune position n’est demandée automatiquement au chargement de la page d’accueil.

Le géocodage inverse de « Ma position » n’est exécuté **qu’une fois** à la sélection. Les mises à jour du suivi GPS sur la carte ne sont pas géocodées et ne remplacent pas le point de départ.

Une erreur de suivi GPS ne doit pas faire disparaître le trajet, la distance, la durée ou les avertissements.

Le domaine ne dépend ni de MapLibre ni d’un fournisseur de géocodage nommé (`BR-004`, `NFR-003`, `NFR-005`).

---

## 10. Flux utilisateur

### FR-016 — Flux utilisateur principal

Le parcours MVP est le suivant :

1. Ouvrir l’écran principal (`FR-014`), y compris via la coque iOS (`FR-027`).
2. Saisir ou sélectionner le point de départ (`FR-017`), y compris via la position actuelle dont l’adresse est alors affichée. Le raccourci **Trouver une destination** (`FR-038`) utilise automatiquement la position actuelle et n’affiche pas de champ d’origine.
3. Choisir le type de trajet : boucle, départ vers destination, ou aller-retour différent. Le raccourci `FR-038` fixe le type à un départ vers destination (`FR-002`).
4. Saisir la destination si le type l’exige (`FR-018`).
5. Indiquer une distance cible (`FR-009`) et/ou une durée disponible (`FR-010`).
6. Choisir un style (`FR-019`).
7. Activer au besoin « éviter les autoroutes » (`FR-007`), « éviter les routes non pavées » (`FR-008`), « Canada seulement » (`FR-030`) et « Corridors RAG » (`FR-029`).
8. Lancer la génération (`FR-011`).
9. Consulter le résultat sur la carte et dans le panneau de synthèse (`FR-013`, `FR-015`, `FR-020`).
10. Régénérer si le trajet ne convient pas (`FR-012`).
11. Activer au besoin le suivi GPS de premier plan sur la carte (`FR-022`).
12. Démarrer une navigation de premier plan si le trajet convient (`FR-023`, `FR-024`, `FR-025`, `FR-026`).
13. Si un écran CarPlay est connecté, y afficher la session déjà démarrée (`FR-028`).

Le flux de configuration doit pouvoir être accompli avec un minimum de réglages (`NFR-002`) et **avant** de prendre la route (`NFR-004`). La navigation virage par virage, une fois démarrée, reste limitée à des actions simples pendant que la moto roule (`NFR-006`).

---

## 11. Écrans du MVP

### FR-017 — Point de départ

L’utilisateur doit pouvoir indiquer un point de départ par recherche de lieu. L’utilisation de la position actuelle est autorisée si l’utilisateur l’accorde explicitement. Le MVP ne demande pas la position en arrière-plan.

Lorsque l’utilisateur choisit sa position actuelle :

1. le système obtient les coordonnées uniquement après cet accord explicite;
2. il convertit ces coordonnées en une **adresse ou un libellé de lieu lisible** par géocodage inverse;
3. le champ de départ **affiche cette adresse**, comme s’il s’agissait d’un lieu choisi par recherche;
4. les coordonnées restent associées au lieu pour la génération (`FR-011`).

Le libellé affiché doit permettre de reconnaître le lieu (rue et localité lorsque le fournisseur les fournit, ou à défaut le nom de lieu le plus précis disponible). Un libellé générique du type « Position actuelle » ne suffit pas lorsqu’une adresse a pu être déterminée.

Si le géocodage inverse échoue ou ne trouve pas d’adresse, le système :

- conserve la position comme point de départ valide;
- affiche un libellé de repli clair (par exemple « Position actuelle »);
- indique que l’adresse n’a pas pu être déterminée.

Le géocodage inverse passe uniquement par l’adaptateur de géocodage (`BR-004`, `NFR-005`). Le domaine ne dépend pas d’un fournisseur nommé.

### FR-018 — Destination

La destination est :

- absente / masquée pour une boucle (`FR-001`);
- obligatoire pour un départ vers destination (`FR-002`);
- obligatoire pour un aller-retour différent (`FR-003`).

### FR-014 — Écran principal

L’écran principal permet de composer la demande de génération. Il peut s’ouvrir par **divulgation progressive** (`FR-031`) : l’explorateur affiche d’abord les actions principales, puis un panneau de composition. Le flux contient au minimum :

- le point de départ, avec l’adresse du lieu sélectionné ou de la position actuelle (`FR-017`);
- le type de trajet;
- la destination, uniquement si le type l’exige;
- la distance cible et/ou la durée disponible;
- le style de trajet;
- les options « éviter les autoroutes », « éviter les routes non pavées », « Canada seulement » et « Corridors RAG »;
- une action principale unique de génération.

L’écran est conçu pour le pouce sur smartphone. Les choix importants utilisent des contrôles larges plutôt que de longues listes.

### FR-015 — Écran résultat

L’écran résultat s’affiche après une génération réussie. Il contient au minimum :

- la carte du trajet (`FR-013`);
- les statistiques essentielles (`FR-020`);
- les avertissements métier, le cas échéant;
- une action de régénération (`FR-012`);
- une action **Démarrer la navigation** (`FR-023`), précédée d’un écran avant le départ (`FR-033`);
- un moyen de revenir modifier la demande.

Sur smartphone, la carte occupe la majorité de l’écran et un panneau inférieur reste accessible sans masquer entièrement le tracé. Un trajet n’est persisté que si l’utilisateur l’enregistre (`FR-035`) ou pour rétablir une session après rafraîchissement (`sessionStorage`, sans positions GPS). La géométrie n’est pas mise dans l’URL.

### FR-020 — Statistiques essentielles

Chaque trajet généré affiche au minimum :

- la distance estimée;
- la durée estimée;
- le type et le style utilisés;
- la proportion d’autoroute, si elle est connue;
- la proportion de routes non pavées, si elle est connue;
- un indicateur de routes répétées pour les boucles et les allers-retours.

Le MVP n’exige pas de score composite ni de comparaison de trois variantes simultanées.

---

## 12. Règles métier

Les règles suivantes gouvernent le comportement du générateur, indépendamment de l’interface et des fournisseurs.

| ID | Règle |
| --- | --- |
| `BR-001` | La distance générée vise ±10 % de la distance demandée ou estimée, sauf impossibilité expliquée. |
| `BR-002` | Minimiser les routes répétées. |
| `BR-003` | Le style demandé prime sur la route la plus rapide. |
| `BR-004` | Le domaine reste indépendant de tout fournisseur de carte ou de routage. |
| `BR-005` | Une durée disponible est convertie en distance estimée selon le style. |
| `BR-006` | Une régénération doit viser un corridor sensiblement différent. |
| `BR-007` | Les routes non pavées connues ne sont pas relâchées silencieusement. |
| `BR-008` | Un recalcul conserve le style et les préférences d’évitement. |
| `BR-009` | Un passage aux États-Unis n’est pas relâché silencieusement. |
| `BR-010` | Une géométrie GPX importée reste la référence de navigation ; le routage ne sert qu’au raccordement, au retour après une sortie, et à l’accroche d’une route `<rte>`. |

### BR-002 — Minimiser les routes répétées

Pour les boucles (`FR-001`) et les allers-retours (`FR-003`), le moteur de génération doit tenter de minimiser le réemploi des mêmes segments routiers.

Pour le mode destination avec retour, l’aller et le retour doivent être **sensiblement différents**. Un simple aller-retour sur la même route ne satisfait pas `FR-003`.

Le seuil exact de chevauchement acceptable peut évoluer. Le MVP n’impose pas encore de pourcentage contractuel unique. Tant qu’un seuil n’est pas figé, le système doit :

- mesurer le chevauchement;
- l’afficher lorsque le type de trajet le rend pertinent;
- chercher à le réduire;
- avertir si un chevauchement important est inévitable.

La comparaison doit reconnaître une même chaussée même si elle est parcourue dans le sens inverse. Cette mesure appartient au domaine, pas à un fournisseur particulier.

---

## 13. Exigences non fonctionnelles

### NFR-001 — Mobile first

La cible d’usage principale est un smartphone. L’interface du flux de génération et du résultat doit être utilisable d’une main, avec des cibles tactiles suffisantes, avant d’être optimisée pour un écran d’ordinateur.

### NFR-002 — Simplicité

Un utilisateur doit pouvoir générer un trajet de base avec une configuration minimale : départ, type, distance ou durée, style, puis génération. Les options avancées restent secondaires.

### NFR-003 — Maintenabilité

Les règles métier restent isolées des fournisseurs externes, des frameworks d’interface, des bases de données et de l’infrastructure. Un changement de carte, de routage ou d’UI ne doit pas entraîner la réécriture du domaine.

### NFR-004 — Sécurité d’usage

Le flux principal de configuration d’un trajet est prévu **avant** de rouler. L’interface de composition ne doit pas exiger une interaction substantielle pendant que la moto est en mouvement.

Une fois la navigation démarrée (`FR-023`), seules des actions simples restent disponibles : couper le son, recentrer la carte et arrêter la navigation (`NFR-006`).

### NFR-005 — Remplaçabilité des fournisseurs

Les fournisseurs de carte et de routage doivent pouvoir être remplacés sans réécrire les règles métier. Toute intégration passe par une interface interne. Le domaine ne référence pas un fournisseur nommé.

L’adaptateur de routage par connaissance est un pipeline RAG optionnel (`ROUTING_PROVIDER=ai-rag` ou option produit `FR-029`) :

1. indexer un graphe routier **local** dont chaque arête est un document (géométrie d’arête, pas une forme géométrique dilatée);
2. récupérer les arêtes par proximité spatiale;
3. classer la pertinence de ces corridors (type de trajet, style) via un modèle de chat côté serveur, authentifié par une clé API;
4. composer un chemin **uniquement** sur les arêtes récupérées afin d’obtenir un corridor (points de passage) ; le modèle n’émet pas de géométrie;
5. produire le tracé affiché et navigable via l’adaptateur de réseau routier configuré (`ROUTING_PROVIDER`) à partir de ce corridor, lorsqu’un réseau réel est branché ; sinon conserver la géométrie simulée du graphe local;
6. si aucun corridor connu ne relie la demande, renvoyer une erreur métier explicite (`FR-021`).

Tant qu’aucun réseau routier réel n’est branché, `ROUTING_PROVIDER=mock` reste la valeur par défaut afin que le mode simulé soit explicite. `ai-rag` réutilise le même type de graphe local déterministe pour le classement ; il n’invente pas de coordonnées par transformation d’une courbe. Lorsque `ROUTING_PROVIDER` pointe vers un adaptateur de réseau réel, l’option `FR-029` et `ai-rag` s’appuient sur cet adaptateur pour le tracé final. Le classement RAG appelle ChatGPT avec `OPENAI_API_KEY` (serveur uniquement, jamais `NEXT_PUBLIC_`). Les tests n’appellent pas l’API réelle.

L’option produit `FR-029` peut demander ce même pipeline **à la requête**, sans changer `ROUTING_PROVIDER`. Le drapeau de transport n’appartient pas au domaine : la couche application choisit l’adaptateur, Zod retire le champ à la validation.

Ce pipeline est un détail d’infrastructure. Il ne constitue pas une fonctionnalité de recommandation de sorties. Un remplacement par un moteur de graphe routier nommé reste possible via la même interface interne.

---

## 14. Navigation virage par virage de premier plan

La navigation assistée fait partie du contrat fonctionnel. Sur l’iPhone et le web, elle reste **limitée au premier plan** : elle ne prétend pas fonctionner lorsque l’écran est verrouillé ou que l’application est suspendue. L’unique exception est une session CarPlay connectée (`FR-028`).

### FR-023 — Démarrage et arrêt d’une navigation

Après une génération réussie, l’utilisateur peut démarrer une session de navigation sur le trajet déjà en mémoire.

Le démarrage :

- n’a lieu qu’après une action explicite de l’utilisateur;
- n’active le suivi GPS (`watchPosition`) qu’à ce moment;
- n’active le guidage vocal qu’après cette action;
- réutilise **une seule** souscription de localisation pour la carte, la navigation et l’afficheur CarPlay (`FR-028`);
- affiche clairement que, hors CarPlay, l’application iPhone doit rester ouverte au premier plan.

L’arrêt, le retour à l’écran résultat ou le démontage :

- interrompent immédiatement le suivi GPS;
- annulent le guidage vocal en cours;
- ignorent tout recalcul en vol;
- ne conservent aucune position GPS.

Sur l’écran de guidage, une action **Annuler la navigation** reste visible en permanence, avec une zone tactile d’au moins 44 × 44 pt (`NFR-001`, `NFR-006`). Une confirmation courte précède l’arrêt, afin d’éviter une annulation accidentelle. L’utilisateur n’a pas à fermer ni à recharger l’application. Après l’annulation depuis **Trouver une destination** (`FR-038`), le volet de recherche se réaffiche, la position actuelle est actualisée, et une nouvelle génération est possible tout de suite.

### FR-024 — Instructions de manœuvre

Pendant la navigation, l’écran affiche au minimum :

- la position actuelle projetée sur le trajet;
- la prochaine manœuvre, avec une flèche correspondant au type;
- la distance avant cette manœuvre;
- le nom ou le numéro de la prochaine route, lorsqu’il est connu;
- la distance totale restante;
- la durée restante;
- l’heure d’arrivée estimée;
- l’état de précision GPS.

Sur smartphone, ces informations sont présentées en overlay sur une carte plein écran, sans bandeaux qui coupent le tracé :

- une bannière supérieure à fort contraste avec la distance avant la manœuvre, la flèche, le nom ou le numéro de route lorsqu’il est connu, et l’instruction;
- un carteau inférieur compact avec l’heure d’arrivée estimée, la durée restante, la distance restante, l’état GPS et l’arrêt;
- des actions flottantes pour couper le son et recentrer la carte (`NFR-006`).

Pendant le suivi caméra de la navigation, la carte est présentée en **vue 3D cap-en-haut** : inclinaison, pastille dans le tiers inférieur, et plus de route visible devant le motard. Un geste (déplacer, zoomer, incliner) suspend ce suivi. Recentrer le rétablit. À l’arrêt (`FR-023`), la carte revient à la vue de dessus du trajet (`FR-013`). Les bâtiments en volume s’affichent seulement lorsque le style de carte les fournit ; le repli raster reste utilisable sans eux (`NFR-005`).

Cette présentation n’ajoute aucune capacité hors contrat. Elle n’est pas une intégration Street View ni Google Maps (`BR-004`).

Les types de manœuvre du domaine sont indépendants de tout fournisseur (`BR-004`) : départ, arrivée, continuer, tourner, demi-tour, bifurcation, fusion, entrée et sortie d’autoroute, fin de route, rond-point (avec numéro de sortie), changement de nom de route, et manœuvre inconnue avec repli sécuritaire.

Une valeur de manœuvre inconnue d’un fournisseur ne doit pas faire échouer tout le trajet. Le système conserve les données utiles disponibles et utilise une instruction générique du type « Continuez sur la route ».

La progression est calculée localement sur la géométrie. Une hystérésis évite qu’un bruit GPS fasse avancer et reculer les instructions. Une précision trop faible affiche un avertissement et ne déclenche ni fausse manœuvre ni recalcul.

### FR-025 — Guidage vocal

Le guidage vocal du **web et de l’iPhone** utilise l’API Web Speech `speechSynthesis` du navigateur. L’adaptateur CarPlay (`FR-028`) utilise une synthèse native locale vers les haut-parleurs du véhicule. Les deux chemins prononcent le **même** texte, calculé dans le domaine ; ils ne se superposent pas.

Contraintes :

- aucune synthèse distante;
- aucun enregistrement audio;
- voix par défaut `fr-CA`, puis `fr-FR`, puis une autre voix française, puis la voix disponible avec le texte français;
- l’utilisateur peut choisir dans **Réglages** une voix précise parmi celles publiées par l’appareil, ainsi que le **débit** et la **hauteur** de la voix; ce choix est conservé sur l’appareil et survit à la fermeture de l’application;
- si `speechSynthesis` est indisponible, la navigation visuelle continue;
- si CarPlay possède la voix, `speechSynthesis` reste muet pour cette session;
- l’utilisateur peut couper et réactiver le son;
- chaque seuil d’annonce n’est prononcé qu’une fois par manœuvre.

#### Choix de la voix dans Réglages

La section **Réglages** présente la liste réelle des voix du navigateur ou de l’appareil, les voix françaises d’abord, les autres regroupées sous **Autres langues**. Un bouton **Essayer** prononce une phrase d’exemple; sur iPhone, ce geste est aussi ce qui accorde `speechSynthesis` à la page.

- l’option **Automatique** est la valeur par défaut : elle applique le classement `fr-CA` → `fr-FR` → autre voix française → première voix disponible;
- une voix choisie puis retirée de l’appareil retombe silencieusement sur ce même classement; aucune navigation ne devient muette;
- le **débit** (`0,85` / `1` / `1,2`) et la **hauteur** (`0,8` / `1` / `1,2`) sont des valeurs discrètes, bornées à `[0,5; 2]` et `[0; 2]`;
- la préférence est relue à chaque énoncé : un changement dans Réglages s’applique sans redémarrer l’application;
- lorsque CarPlay possède la voix (`FR-028`), la synthèse native du véhicule s’applique et ce réglage reste sans effet;
- si `speechSynthesis` est indisponible, la section le nomme explicitement et le repli sonore (`FR-044`) reste actif.

Les seuils par défaut, configurables et testés, sont :

- préparation à environ 500 m;
- approche à environ 150 m;
- manœuvre imminente à environ 40 m.

Lors d’un recalcul, les annonces devenues obsolètes sont annulées. La file vocale est remplacée. Deux annonces ne se superposent jamais.

#### Chemin audible sur iPhone

`speechSynthesis` n’est accordé à une page iOS que si celle-ci **parle pendant un geste utilisateur**. Une manœuvre est annoncée depuis un relevé GPS, qui n’est pas un geste : sans amorce, toute la sortie reste muette. Par conséquent :

- **Démarrer la navigation** émet un énoncé d’amorce silencieux (volume 0) au moment du geste; il n’annonce aucune manœuvre;
- au retour de l’application au premier plan, la file vocale est reprise : iOS la laisse en pause après un verrouillage d’écran;
- la file n’est annulée que lorsqu’une annonce est réellement en cours; annuler un moteur au repos fait perdre l’énoncé suivant sur Safari;
- la voix française est retenue dès que le navigateur publie sa liste (`voiceschanged`), la première liste étant souvent vide;
- une erreur du moteur est mémorisée : la session bascule alors sur les indications sonores (`FR-044`).

### FR-026 — Détection hors trajet et recalcul

Une seule lecture GPS hors géométrie ne constitue pas une sortie de trajet.

Le seuil de distance est :

```text
seuil_hors_trajet = max(60 mètres, précision_GPS × 2)
```

L’utilisateur n’est déclaré hors trajet que lorsque plusieurs lectures **précises** consécutives dépassent ce seuil, que la situation persiste pendant une durée minimale, et que la progression ne correspond pas simplement à un raccourci ou à une route parallèle très proche.

Un recalcul n’est pas déclenché si :

- la précision GPS est insuffisante;
- un recalcul est déjà en cours;
- le délai de récupération suivant un recalcul n’est pas écoulé;
- la navigation est arrêtée.

La progression normale se calcule localement. Le système n’appelle pas un service de map-matching à chaque mise à jour GPS. Les appels réseau restent exceptionnels et n’ont lieu que lorsqu’un recalcul est réellement nécessaire.

Le recalcul :

- part de la position GPS actuelle;
- passe uniquement par `RoutingProvider`;
- valide strictement la requête;
- conserve le style, `avoidHighways`, `avoidUnpaved`, `stayInCanada` et l’option de corridors connus (`BR-008`, `FR-029`);
- applique les mêmes règles et avertissements que la génération initiale;
- ignore les réponses obsolètes (identifiant de génération ou `AbortController`);
- n’efface jamais silencieusement le trajet courant en cas d’échec.

Comportement selon le type de trajet :

- **Destination** : recalculer vers la destination finale.
- **Boucle** : raccorder l’utilisateur à un point raisonnable plus loin sur la portion restante; ne pas prendre automatiquement le raccourci direct vers le départ.
- **Aller-retour différent** : raccorder l’utilisateur au corridor restant approprié, sans transformer silencieusement le trajet en retour direct.

La fusion évite les coordonnées et étapes dupliquées, recalcule les distances cumulées, met à jour les instructions et la géométrie affichée, conserve les avertissements pertinents et ne réannonce pas les manœuvres déjà franchies.

Si le recalcul échoue, l’ancien trajet reste visible, une erreur compréhensible s’affiche, et l’utilisateur peut continuer ou réessayer.

### BR-008 — Préservation des préférences lors du recalcul

Un recalcul (`FR-026`) conserve le type de trajet, le style (`FR-004`, `FR-005`, `FR-006`), les préférences d’évitement (`FR-007`, `FR-008`, `FR-028`) et l’option de corridors connus (`FR-029`). Il ne relâche pas silencieusement une contrainte de surface connue (`BR-007`) ni un passage aux États-Unis (`BR-009`) et ne change pas le problème en plus court chemin vers le départ.

### NFR-006 — Navigation sécuritaire de premier plan

La navigation iPhone est conçue pour un smartphone tenu ou fixé, application ouverte. Elle :

- utilise des cibles tactiles d’au moins 48 × 48 px;
- évite toute configuration complexe pendant que la moto roule;
- n’utilise qu’une seule souscription `watchPosition()` à la fois, avec `enableHighAccuracy` et `maximumAge: 0`;
- nettoie toujours cette souscription à l’arrêt, au démontage, ou lorsque l’app passe en arrière-plan **sans** scène CarPlay connectée;
- n’envoie une position au serveur que pour un recalcul réellement nécessaire;
- ne journalise aucune coordonnée;
- ne sauvegarde aucune position GPS;
- ne demande aucune permission de localisation en arrière-plan;
- ne prétend pas fonctionner écran verrouillé ou application suspendue, **sauf** tant qu’une scène CarPlay reste connectée (`FR-028`).

Une erreur de carte, de voix ou de GPS ne doit pas provoquer une boucle de requêtes.

Le mode d’arrière-plan `audio` n’est autorisé que pour le guidage vocal CarPlay. Il ne constitue pas une autorisation de suivi GPS en arrière-plan.

### NFR-007 — Conteneur natif remplaçable

La coque iOS (`FR-027`) et la scène CarPlay (`FR-028`) sont des **détails d’infrastructure**. Capacitor, WKWebView, CarPlay, MapKit, les plugins de localisation, de barre de statut ou de verrouillage d’écran ne doivent pas apparaître dans le domaine.

Un remplacement du conteneur (autre WebView, autre pont natif, autre template véhicule) ne doit pas obliger à réécrire les règles métier, le générateur ou le calcul de navigation (`BR-004`, `NFR-003`).

### FR-027 — Coque iOS

L’application MVP peut s’ouvrir comme une application iPhone : icône, écran de lancement, barre de statut et zones sûres (encoche, indicateur d’accueil).

La coque :

- expose le même flux que le web (`FR-014` à `FR-016`);
- réutilise la même carte, le même GPS de premier plan et la même navigation (`FR-013`, `FR-022` à `FR-026`);
- peut exposer cette navigation sur CarPlay via un adaptateur natif (`FR-028`);
- demande uniquement la localisation **lorsque l’app est utilisée** (`NSLocationWhenInUseUsageDescription`);
- n’active aucun mode d’arrière-plan de localisation;
- ne prétend pas fonctionner écran verrouillé, en arrière-plan ou hors ligne, hors exception CarPlay (`FR-028`).

Le guidage vocal iPhone reste `speechSynthesis` (`FR-025`). Pendant une navigation démarrée (`FR-023`), la coque peut empêcher la mise en veille de l’écran tant que l’app reste au premier plan (`NFR-006`). Safari et l’ordinateur conservent les adaptateurs navigateur existants.

### FR-028 — Navigation CarPlay

Après une action **Démarrer la navigation** (`FR-023`), si un écran Apple CarPlay est connecté, Ride y affiche la session déjà en mémoire. CarPlay n’est pas un second moteur de navigation : c’est un **afficheur et un chemin audio** alimentés par le même calcul de progression, de manœuvre et de hors-trajet (`FR-024`, `FR-026`).

L’écran CarPlay et l’écran iPhone partagent le même chrome, calqué sur une navigation carte type Google Maps, sans reprendre la marque ni le SDK Google (`BR-004`) :

- carte plein écran, pastille de position avec cap, tracé du trajet;
- vue 3D cap-en-haut pendant le suivi, alignée sur l’iPhone (`FR-024`), y compris les bâtiments 3D du fournisseur de carte lorsqu’ils sont disponibles;
- bannière de prochaine manœuvre (flèche, distance, nom ou numéro de route);
- barre d’arrivée (distance restante, durée restante, heure d’arrivée estimée);
- actions simples uniquement : couper le son, recentrer, aperçu du trajet, arrêter (`NFR-004`, `NFR-006`);
- reprise du trajet actif, liste des récents et des trajets enregistrés via `CPListTemplate` (`FR-035`);
- recherche limitée aux lieux **déjà connus** sur l’appareil via `CPSearchTemplate` (pas une imitation web de CarPlay).

La planification d’une boucle (distance, style, corridors) se fait sur l’iPhone (`FR-031`, `FR-034`), puis le trajet prêt apparaît dans CarPlay.

Hors portée de `FR-028` : Street View photographique, trafic, limitations de vitesse, guidage de voies, Siri, génération d’une boucle complexe depuis le tableau de bord, Android Auto. La vue 3D de navigation n’est pas du Street View. Une PWA ou une page web n’est **pas** une app CarPlay.

Tant que la scène CarPlay reste connectée :

- le suivi GPS et le guidage vocal de la session en cours peuvent continuer si l’iPhone est verrouillé;
- aucune permission de localisation en arrière-plan n’est demandée;
- à la déconnexion, les règles de premier plan iPhone (`NFR-006`, `FR-027`) s’appliquent à nouveau.

Le WebView Capacitor n’est pas affiché sur CarPlay. L’adaptateur natif (template de carte et synthèse vocale locale) reste hors du domaine (`NFR-007`). L’entitlement Apple Navigation (`com.apple.developer.carplay-maps`) et la compilation Xcode / simulateur CarPlay exigent un Mac et une demande Apple ; ce dépôt fournit le code et la configuration, pas l’approbation.

### FR-031 — Architecture d’information mobile

L’interface téléphone est **carte d’abord**. La navigation principale compte quatre onglets : Explorer, Mes trajets, Enregistrés, Réglages. Une session de guidage (`FR-023`) est un mode plein écran : la barre d’onglets est masquée.

L’explorateur montre d’abord :

- Rechercher une destination, Décrire mon trajet, Importer un fichier GPX (`FR-039`);
- Reprendre la navigation, s’il existe un trajet en mémoire;
- les trajets favoris (`FR-035`).

L’accueil ne porte ni titre visible, ni indicateur d’état GPS, ni bouton « Ma position » :
il n’expose que ces actions. Les destinations récentes restent conservées (`FR-035`) et
proposées sur CarPlay (`FR-028`), mais ne sont plus listées sur l’accueil téléphone.
L’accueil ne demande toujours aucune position de lui-même (`FR-017`) : la position n’est
sollicitée qu’à l’ouverture d’un flux, automatiquement pour **Trouver une destination**
(`FR-038`) et **Décrire mon trajet** (`FR-034`), ou par le contrôle GPS de la carte.

**Rechercher une destination** ouvre le volet **Trouver une destination** (`FR-038`) : position actuelle automatique, champ unique de destination, génération et prévisualisation, puis navigation. Ce n’est pas le formulaire de composition (`FR-014`).

**Réglages** contient l’apparence (`FR-037`), le thème de la carte (`FR-045`), le style **Panoramique** ou **Le plus rapide**, et les préférences de route **Éviter les autoroutes**, **Éviter les routes non pavées** et **Canada seulement** (`FR-007`, `FR-008`, `FR-030`). Le style et ces trois options sont conservés uniquement pendant la session du navigateur; une nouvelle session revient à **Panoramique** avec **Éviter les autoroutes** désactivé. Les flux **Décrire mon trajet** (`FR-034`), **Trouver une destination** (`FR-038`) et **Importer un fichier GPX** (`FR-039`, raccordement, retour hors trajet, et accroche `<rte>`) les lisent à la génération et ne les affichent pas dans leur panneau. La géométrie d’une trace `<trk>` reste autoritaire (`BR-010`) : les préférences ne la remplacent pas.

**Importer un fichier GPX** ouvre le flux `FR-039` dans la même vue carte, sans perturber **Trouver une destination**.

**Décrire mon trajet** reste dans cette vue carte (`FR-034`) : l’utilisateur choisit une distance et active ou non **Boucle**, le système obtient la position actuelle, puis l’IA génère le tracé sur la carte déjà visible, sans ouvrir l’écran de composition (`FR-014`). Il n’y a plus d’action explorateur distincte « Créer une boucle moto ».

Le formulaire de composition (`FR-014`) s’ouvre par divulgation progressive dans un panneau inférieur. Les zones tactiles visent au moins 44 × 44 pt (`NFR-001`, `NFR-006`). La langue d’interface du MVP est le français canadien ; les chaînes restent extractibles pour une localisation anglaise future.

### FR-032 — Recherche de lieu (états et annulation)

La recherche par nom, adresse, lieu ou code postal (`FR-040`) affiche un nom et une ligne secondaire (adresse, municipalité, province et pays) pour distinguer les homonymes. Deux municipalités portant le même nom — par exemple Granby au Québec et Granby au Colorado — doivent rester différenciables sans ouvrir le résultat. Les états à gérer : vide, saisie, chargement, résultats, aucun résultat, hors réseau, erreur fournisseur, lieu sélectionné, requête annulée.

Chaque résultat indique aussi son **type** : adresse, ville, code postal ou lieu.

La recherche se déclenche après environ **300 ms** d’inactivité. Une recherche plus récente **annule** la précédente. Un résultat obsolète ne doit jamais remplacer l’affichage d’une requête plus récente. L’intelligence artificielle ne fournit pas de coordonnées inventées.

Le premier résultat n’est **jamais** présélectionné : lorsque plusieurs lieux correspondent, l’utilisateur choisit.

Les résultats proches de la position actuelle sont favorisés, et le Québec puis le Canada sont priorisés. Cette priorité est un **classement**, jamais un filtre : une destination hors Canada reste accessible.

Une erreur réseau ou fournisseur affiche un message clair et une action **Réessayer**. La liste est utilisable au clavier (flèches, `Début`, `Fin`, `Entrée`, `Échap`) et au toucher, avec des cibles d’au moins 44 × 44 pt (`NFR-001`, `NFR-006`).

### FR-033 — Écran avant le départ

Avant **Démarrer** (`FR-023`), l’utilisateur voit au minimum : destination ou nom de boucle, distance et durée, état GPS, disponibilité du trajet, guidage vocal activé ou non, avertissements pertinents. Si une permission manque, le message décrit le problème et offre une action directe (par ex. « Ma position »). **Démarrer** lance la navigation **dans Ride** : pas d’URL externe, pas de page blanche.

### FR-034 — Génération IA depuis la position (Décrire mon trajet)

Le flux **Décrire mon trajet** produit un trajet moto à partir de la position actuelle et d’une distance choisie. L’utilisateur active ou non **Boucle** :

- **Boucle activée** (défaut) : le tracé revient au départ (`FR-001`);
- **Boucle désactivée** : trajet aller de la distance demandée, sans retour au départ ; l’IA choisit l’arrivée (ce n’est pas une destination saisie par l’utilisateur, `FR-018`).

Il ne s’agit pas d’une recommandation de sorties hors demande : chaque génération calcule un trajet à la demande (`FR-011`), distinct de l’option facultative `FR-029` du formulaire de composition. L’état de **Boucle** est conservé sur l’appareil.

Ce flux ne propose **pas** :

- de champ d’adresse d’origine, ni de saisie manuelle du départ;
- de bouton « Ma position »;
- de sélection par durée (`FR-010`) : aucune durée souhaitée n’est envoyée;
- de génération aléatoire ou non assistée par l’IA (pas de repli silencieux vers `createLoopWaypointSets` ni vers un fournisseur sans IA);
- des interrupteurs « Éviter les autoroutes », « Éviter les routes non pavées » ou « Canada seulement » : ces options se règlent dans **Réglages** (`FR-031`) et sont lues à la génération;
- d’une action explorateur séparée « Créer une boucle moto ».

#### Distance

L’utilisateur sélectionne uniquement la distance avec un gradateur tactile :

- minimum **20 km**, maximum **500 km**, pas recommandé **10 km**;
- la valeur choisie reste affichée en permanence (ex. « 180 km »);
- la dernière valeur est conservée sur l’appareil; **100 km** si aucune valeur n’existe;
- accessibilité : `aria-valuemin`, `aria-valuemax`, `aria-valuenow` et un libellé explicite;
- zone tactile suffisante pour un usage téléphone, y compris avec des gants.

#### Position de départ automatique

À l’ouverture du flux, le système demande une **localisation précise ponctuelle**. Le suivi GPS continu (`watchPosition`) ne commence qu’au **Démarrer la navigation** (`FR-023`).

Affichage : un petit état non interactif, par exemple « Position détectée » ou « Recherche de la position… ». Pas de section d’origine complète.

Si le navigateur exige une interaction, la permission est demandée automatiquement sur **Générer mon trajet**. Si la permission est refusée ou si la localisation échoue : explication claire et bouton **Réessayer la localisation**. Jamais de champ d’adresse.

#### Génération obligatoire par l’IA et recherche Web

**Générer mon trajet** (bouton principal pleine largeur) et **Régénérer** passent toujours par le service d’IA côté serveur. L’IA reçoit au minimum :

- latitude et longitude actuelles;
- précision de la localisation, lorsqu’elle est connue;
- distance demandée;
- si le trajet doit revenir au départ (**Boucle**) ou non;
- préférences moto encore applicables (`FR-007`, `FR-008`, `FR-030`, style du domaine s’il est encore fourni);
- lors d’une régénération, l’identifiant ou la signature du trajet précédent (`BR-006`).

Avant de proposer un itinéraire, l’IA consulte automatiquement le Web, autour de la position, pour des routes panoramiques, des routes sinueuses, des points d’intérêt, des guides ou communautés moto, des fermetures ou restrictions, et des routes incompatibles avec les préférences. Cette recherche et le raisonnement restent **invisibles** : le client ne reçoit ni requêtes, ni sources, ni réponses brutes du modèle, ni clés API.

Une recherche Web exécutée correctement mais sans résultat exploitable ne bloque pas la génération : l’IA propose tout de même des points plausibles, puis le moteur de routage les valide sur le réseau. Seule une véritable indisponibilité du service de recherche produit l’erreur « Recherche Web indisponible ».

Pendant l’opération, l’interface affiche uniquement un état simple : « L’IA prépare votre trajet moto… ».

L’IA **n’invente pas** la géométrie. Elle sélectionne des routes, corridors, points d’intérêt ou points de passage structurés. Le moteur de routage configuré (détail d’infrastructure, p. ex. un adaptateur de réseau routier) :

- valide, déduplique et ordonne les points de passage en un corridor cohérent avant le calcul, afin d’éviter les zigzags, croisements et demi-tours issus d’une réponse désordonnée;
- calcule un trajet qui suit le réseau;
- produit géométrie, manœuvres et instructions;
- vise la distance demandée selon `BR-001` (±10 %);
- si **Boucle** est activée, retourne une boucle commençant et se terminant près de la position actuelle (`FR-001`);
- si **Boucle** est désactivée, retourne un aller qui commence près de la position actuelle et s’arrête à l’arrivée choisie, sans refermer la boucle.

Si l’IA, la recherche Web ou le moteur de routage est indisponible, le système affiche une erreur claire et **Réessayer**. Il ne bascule pas silencieusement vers un générateur non-IA, ni vers `createLoopWaypointSets`.

Lorsque ces services répondent, le système **doit produire un trajet utilisable**. Si le premier plan IA ne se traduit pas en tracé réseau (points de passage inutilisables, accroche impossible, boucle géométrique, écart à `BR-001`), le serveur relance le planificateur IA avec la raison de l’échec, sans inventer de géométrie. Après ces tentatives, s’il existe un trajet sur le réseau qui ne respecte pas ±10 %, il est tout de même proposé, avec un avertissement qui affiche la distance réelle (`BR-001`) : la tolérance n’est jamais élargie en silence. « Aucun trajet valide » n’apparaît que s’il n’existe aucun tracé réseau, si un service est indisponible, ou si une contrainte dure l’interdit (`FR-008` surface connue, `FR-030`, corridor de régénération `FR-012`).

#### Résultat, navigation et régénération

Après une génération réussie, le flux **reste dans la même fenêtre** :

- le tracé s’affiche sur la carte déjà visible, cadrée sur l’ensemble du parcours (`FR-013`);
- la distance réelle et la durée estimée sont affichées (`FR-020`);
- **Démarrer la navigation** réutilise le trajet affiché, sans nouvelle génération (`FR-023` à `FR-026`, guidage vocal en français);
- **Régénérer** conserve distance et préférences, utilise la position actuelle, demande un corridor différent (`BR-006`), garde l’ancien tracé jusqu’à succès, et ne l’efface jamais en cas d’erreur.
- Si **Boucle** est désactivée, la régénération conserve le type destination (`FR-012`) ; l’arrivée n’est pas une saisie utilisateur (`FR-018`), donc l’IA peut proposer une nouvelle arrivée de la distance demandée. La séparation départ/arrivée de `FR-002` ne s’applique pas à cette arrivée proposée.
- Un changement de **Boucle** après génération change le type de trajet : le système génère un nouveau trajet au lieu d’une régénération `FR-012`.

Pendant une requête : désactiver Générer, Régénérer et Démarrer la navigation au besoin, ignorer les doubles requêtes, afficher un indicateur de progression, permettre une nouvelle tentative après erreur, préserver le dernier trajet valide (`FR-021`).

États à prévoir : recherche de la position; permission refusée; position indisponible; génération IA en cours; recherche Web indisponible; moteur de routage indisponible; aucun trajet valide; nouvelle tentative; régénération en cours.

### FR-035 — Destinations récentes et trajets enregistrés locaux

Les lieux choisis et les trajets **enregistrés explicitement** sont conservés sur l’appareil (`localStorage`). Une session active peut être rétablie après rafraîchissement (`sessionStorage`) sans miettes GPS ni géométrie dans l’URL. Pas de compte cloud dans le MVP. Un trajet enregistré doit pouvoir être ramené à l’écran avant le départ en au plus trois interactions.

### FR-036 — Machine d’état de navigation

Le guidage s’appuie sur une machine d’état de domaine, indépendante de l’UI : inactif, permission requise, recherche de position, calcul, prévisualisation, prêt, navigation active, hors trajet, recalcul, GPS temporairement perdu, suspendu, arrivée, erreur. Un trajet GPX (`FR-039`) ajoute les phases explicites `gpx_preview`, `joining_gpx`, `following_gpx` et `gpx_completed`.

Un rafraîchissement ne doit pas perdre le trajet composé. Un hors-trajet réel déclenche un recalcul contrôlé (`FR-026`) sans effacer l’écran. Une imprécision GPS isolée ne compte pas comme sortie de route. Une perte temporaire de GPS ne fait pas planter l’application. Le recalcul conserve style et préférences (`BR-008`).

### FR-037 — Modes clair, sombre et navigation nocturne

L’interface offre un mode clair, un mode sombre et un mode navigation nocturne (contraste élevé, teinte chaude). Le mode système suit `prefers-color-scheme`. Les commandes ne s’appuient pas uniquement sur la couleur (`NFR-001`).

### FR-038 — Trouver une destination (position actuelle → aperçu → navigation)

Le volet **Trouver une destination** produit un trajet moto `FR-002` à partir de la **position actuelle** et d’une destination choisie. Il reste dans la vue carte (`FR-031`). Ce n’est pas le formulaire de composition (`FR-014`) et ce n’est pas **Décrire mon trajet** (`FR-034`).

Ce flux ne propose **pas** :

- de champ d’adresse d’origine, ni de saisie manuelle du départ;
- de sélecteur de distance ou de durée (`FR-009`, `FR-010`);
- des interrupteurs de préférences de route ni du style de trajet : ces options se règlent dans **Réglages** (`FR-031`) et sont lues à la génération. **Panoramique** utilise le classement `scenic` (`FR-005`); **Le plus rapide** minimise le temps estimé parmi les candidats viables. Sans choix de session, le défaut reste **Panoramique**;
- de duplication des options déjà disponibles dans Réglages (`avoidHighways`, `avoidUnpaved`, `stayInCanada`).

#### Position de départ automatique

À l’ouverture du volet, le système demande une **localisation précise ponctuelle**. Le suivi GPS continu (`watchPosition`) ne commence qu’au **Démarrer la navigation** (`FR-023`).

Affichage : le volet **n’affiche pas** la position obtenue. Comme l’accueil de l’explorateur, il ne porte ni titre visible, ni bandeau d’état GPS : la carte est déjà à l’écran et le premier élément du volet est le champ de destination. La confirmation « Position détectée » et le libellé du lieu (adresse si le géocodage inverse la fournit, sinon « Position actuelle ») restent **annoncés aux technologies d’assistance** (`role="status"`), jamais rendus visuellement. Reste visible : « Recherche de la position… » pendant la localisation, parce que c’est ce qui explique un bouton **Générer le trajet** désactivé. Pas de section d’origine complète, ni de position modifiable.

Si la permission est refusée ou si la localisation échoue : explication claire, **Réessayer la localisation**, et lorsque c’est possible **Ouvrir les réglages de localisation**. Jamais de champ d’adresse d’origine.

#### Destination

Un seul champ principal : **Où voulez-vous aller?**, dont l’invite est **Adresse, ville ou code postal**. La recherche réutilise le système existant (`FR-032`).

Quatre façons de définir la destination :

- une **adresse complète** (par ex. `125 rue Principale, Granby, Québec`);
- une **ville ou municipalité** (par ex. `Roxton Pond`, `Sherbrooke, QC`);
- un **code postal** canadien (par ex. `J2G 2W4`);
- un **point choisi sur la carte**.

La destination n’est **jamais** transmise au moteur de routage sous forme de texte. Elle est d’abord géocodée et possède des coordonnées valides. Une seule représentation sert à tous les cas : le `Place` du domaine, enrichi de la municipalité, de la province, du pays, du code postal, du type et de la précision.

##### Villes

Une destination de type ville est une destination valide à part entière. Le volet affiche la municipalité, la province et le pays, utilise les coordonnées officielles retournées par le géocodeur, et distingue clairement deux villes homonymes.

##### Codes postaux

Un code postal canadien est reconnu avec ou sans espace et sans tenir compte des majuscules (`J2G2W4`, `j2g 2w4`, `J2G 2W4`). Il est normalisé à l’affichage au format `A1A 1A1`.

Un code postal complet est d’abord résolu dans la base de référence (`FR-040`), qui en donne un point **exact**. À défaut — base non configurée, indisponible, ou code inconnu — la recherche retombe sur le fournisseur de géocodage, puis sur la **RTA** (les trois premiers caractères).

Lorsque le code désigne alors une **zone** plutôt qu’une adresse précise, le volet l’indique comme **emplacement approximatif** et pose le marqueur sur la carte, où il peut être déplacé avant de générer le trajet.

##### Point sur la carte

Le volet flotte au-dessus de la carte de l’explorateur : choisir un point et taper une adresse sont donc offerts **en même temps, dans le même écran**. Aucun bouton et aucune carte plein écran ne s’interposent — sous le champ, une simple mention rappelle que la carte est directement utilisable.

L’utilisateur déplace et zoome la carte, voit sa position actuelle, et place la destination par **appui long** (mobile) ou par **clic** (ordinateur). Le marqueur reste déplaçable ensuite, et le point choisi devient la destination **dès qu’il est posé** : il n’y a ni confirmation ni annulation à faire.

Après le placement du marqueur, un géocodage inverse cherche l’adresse correspondante. S’il n’en trouve aucune, le libellé **« Point sélectionné sur la carte »** accompagné des coordonnées est utilisé. **Un échec du géocodage inverse n’empêche jamais la sélection.** Une réponse tardive pour une position abandonnée ne remplace pas le libellé du marqueur courant, pas plus qu’une adresse choisie au clavier entre-temps.

La carte n’est sélectionnable que pendant que le volet est ouvert : elle redevient un simple affichage au retour à l’accueil et pendant la navigation.

##### Destination sélectionnée

Une fois la destination confirmée, les résultats sont remplacés par une carte récapitulative : nom ou adresse, ville et province, type de destination, **Modifier** et **Effacer la destination**. La destination est marquée sur la carte de l’explorateur ; un emplacement approximatif s’ajuste en déplaçant ce marqueur.

Si l’utilisateur modifie le texte après avoir sélectionné une destination, l’ancienne sélection est **invalidée**. **Générer le trajet** n’utilise jamais silencieusement les anciennes coordonnées, et ne déclenche jamais de génération à partir du texte encore présent dans le champ.

**Générer le trajet** n’est actif que si une destination explicitement sélectionnée ou confirmée, avec des coordonnées valides, **et** une position actuelle sont disponibles. Il reste désactivé pendant la localisation, la génération et la navigation. Un géocodage inverse encore en cours ne le désactive pas : les coordonnées du point suffisent au routage.

#### Génération

**Générer le trajet** :

- utilise les coordonnées GPS actuelles comme départ et la destination choisie comme arrivée;
- transmet les préférences enregistrées dans Réglages;
- affiche un état de chargement clair et ignore les doubles soumissions;
- **annule** toute génération précédente encore en cours (p. ex. `AbortController`). Une réponse tardive d’une ancienne requête ne remplace jamais le trajet plus récent.

Le schéma JSON Ride du trajet généré est conservé. Ce flux n’introduit pas de format TomTom ou GPX.

#### Prévisualisation

Après une génération réussie, le flux **reste dans la même fenêtre** :

- le tracé complet s’affiche sur la carte déjà visible, cadrée sur l’ensemble du parcours (`FR-013`);
- la distance réelle et la durée estimée sont des **informations seulement** (`FR-020`);
- **Démarrer la navigation** réutilise **exactement** le trajet affiché, sans nouvelle génération (`FR-023` à `FR-026`);
- une action secondaire **Modifier la destination** ou **Générer un autre trajet** permet de changer la destination ou de relancer une génération. Changer la destination n’envoie pas automatiquement une nouvelle génération.

Deux navigations ou deux générations ne peuvent pas être actives en même temps. L’état du trajet actif et de la navigation active est unique pour la carte, le volet et l’écran de guidage.

#### Annulation et nouvelle génération

Pendant la navigation, **Annuler la navigation** (`FR-023`) arrête proprement le guidage, la voix, le suivi de progression, le recalcul, les observateurs GPS propres à la navigation, les minuteries et les requêtes encore actives.

Ensuite :

- l’état de navigation active est supprimé;
- aucune instruction vocale ou manœuvre obsolète ne continue;
- le volet **Trouver une destination** se réaffiche **sans rechargement**;
- la position GPS est actualisée;
- la destination précédente peut rester visible et reste **modifiable**;
- aucune génération n’est relancée automatiquement.

États à prévoir, exclusifs : `idle`, `locating`, `destinationReady`, `generating`, `routePreview`, `navigating`, `cancelling`, `error`.

Le champ de destination gère en parallèle ses propres états (`FR-032`) : champ vide, saisie en cours, recherche en cours, résultats disponibles, aucun résultat, erreur réseau, destination sélectionnée. La sélection sur la carte ajoute : point posé, géocodage inverse en cours, géocodage inverse échoué. L’indisponibilité du GPS et le refus de permission sont couverts par la section **Position de départ automatique**.

### FR-039 — Import GPX et navigation sur la trace

L’utilisateur peut importer un fichier `.gpx` depuis l’explorateur (`FR-031`), sans remplacer le flux **Trouver une destination** (`FR-038`) ni **Décrire mon trajet** (`FR-034`).

Après importation, l’application prévisualise le trajet sur la carte déjà visible (`FR-013`) : nom (issu du GPX, sinon du fichier), trace complète, départ, arrivée, distance calculée sur la géométrie. **Démarrer la navigation** réutilise ce trajet (`FR-023` à `FR-026`).

#### Fichier et analyse

Le sélecteur de fichiers accepte notamment `.gpx`, `application/gpx+xml`, `application/xml`, `text/xml` et `application/octet-stream`, y compris sur iPhone / PWA. iOS ne reconnaît pas l’UTI de l’extension `.gpx` : sans `application/octet-stream` dans le filtre natif (`accept`), les fichiers restent grisés et incliquables dans Fichiers. Un type MIME vide ou `application/octet-stream` est valide si le nom se termine par `.gpx`. Le contenu est ensuite validé localement.

L’analyse est **locale**. Les entités XML externes et les déclarations `DOCTYPE` / `ENTITY` sont rejetées. Un fichier vide, corrompu, trop volumineux, sans coordonnées valides ou ne contenant que des waypoints `<wpt>` produit une erreur compréhensible.

Formats : GPX 1.0 et 1.1, avec espaces de noms. Éléments : `<trk>` / `<trkseg>` / `<trkpt>`, `<rte>` / `<rtept>`, et champs facultatifs `name`, `desc`, `ele`, `time`.

Règles de géométrie :

- une trace `<trk>` fournit la géométrie **autoritaire**;
- une route `<rte>` seule conserve l’ordre exact des `rtept` ; le moteur de routage existant (`RoutingProvider`, `BR-004`) construit la géométrie routable **sans réordonner** les points;
- plusieurs `<trkseg>` d’une même trace restent des parties distinctes : aucune ligne droite artificielle entre segments non contigus;
- plusieurs traces ou routes d’un même fichier restent des trajets distincts ; l’utilisateur en choisit une ; elles ne sont pas fusionnées en silence.

Le résultat est converti vers le JSON interne Ride, avec au minimum `source: "gpx"`, un nom, la géométrie, les segments, la distance et les métadonnées utiles (parties, boucle fermée, genre piste/route).

#### Point d’entrée et deux phases

Au **Démarrer la navigation**, l’application utilise la position GPS actuelle. Le point d’entrée est la **projection sur la polyligne**, pas seulement le sommet GPX le plus proche. En cas d’ex æquo, le cap de déplacement puis l’ordre du trajet départagent.

Phases :

1. `gpx_preview` — prévisualisation;
2. `joining_gpx` — raccordement routable de la position actuelle vers le point d’entrée, affiché dans un style distinct, message **Rejoindre le trajet GPX**, distance restante, instructions visuelles et vocales existantes. Si l’utilisateur est déjà assez près (seuil unique configurable, tenant compte de la précision GPS), cette phase est sautée;
3. `following_gpx` — suivi de la géométrie GPX à partir du point d’entrée, message **Trajet GPX**, ordre original des points, sans recalcul OSRM de toute la trace;
4. `gpx_completed` — arrivée.

La géométrie GPX importée n’est **jamais** remplacée par un itinéraire plus rapide du fournisseur de routage (`BR-010`). Le routage ne sert qu’au raccordement, au retour après une sortie, et à l’accroche d’une route `<rte>`. Ces appels de routage lisent les préférences enregistrées dans Réglages (`FR-007`, `FR-008`, `FR-030`, `FR-031`).

Sens : jamais d’inversion automatique. Trace ouverte : du point d’entrée jusqu’au dernier point. Boucle fermée : du point d’entrée jusqu’à la fin, reprise au début, fin après une boucle complète de retour au point d’entrée.

La progression le long du GPX est monotone, avec une petite tolérance GPS (`FR-024`). Elle tient compte de la progression précédente, de la distance au tracé, du cap et de la portion restante, afin d’éviter un retour en arrière, un saut sur une parallèle, un changement de branche à une intersection, une oscillation ou la fin prématurée d’une boucle.

#### Sortie, retour et annulation

Une sortie confirmée (`FR-026`) affiche **Hors trajet**, conserve le GPX original, et calcule seulement un raccordement vers un point cohérent **plus loin** sur la portion restante. Le retour sur la trace reprend `following_gpx`.

**Annuler** fonctionne pendant la prévisualisation, le calcul du raccordement, `joining_gpx`, `following_gpx` et le recalcul. L’arrêt coupe le suivi et la voix, ignore les requêtes en vol, retire le GPX et le raccordement de la carte, réinitialise l’état, et permet d’importer ou de générer un autre trajet immédiatement (`FR-023`).

### FR-040 — Recherche de destination par code postal canadien

Le champ unique de destination (`FR-038`) accepte une **adresse**, une **ville**, un **lieu** et un **code postal canadien**. Un code postal complet, écrit `J2G 2W4` ou `J2G2W4`, en majuscules ou en minuscules, désigne la **même** destination.

La chaîne saisie est normalisée : espaces, tiret et casse retirés, forme canonique `J2G2W4`. Une chaîne de six caractères quelconques n’est pas un code postal : la validation suit la forme de Postes Canada (`A1A1A1`, sans les lettres D, F, I, O, Q, U, et sans W ni Z en première position).

Lorsque la chaîne est un code postal complet, le système interroge une **base de référence** de codes postaux par **égalité exacte** sur le code normalisé. Le résultat trouvé devient une destination du modèle existant : coordonnées, municipalité et libellé lisible « `J2G 2W4, Granby, QC` ». La destination se sélectionne, s’affiche sur la carte et alimente **Générer le trajet** comme n’importe quel autre lieu (`FR-038`).

Repli, dans cet ordre :

- code postal complet **trouvé** dans la base de référence → destination;
- code postal complet **absent**, saisie partielle (`J2G`, `J2G 2`), adresse, ville ou POI → fournisseur de géocodage existant (`FR-032`);
- clic sur la carte → géocodage inverse existant (`FR-017`).

La base de référence est un **détail d’infrastructure** (`BR-004`, `NFR-005`) : le domaine décrit un `PostalCodeProvider` et ne connaît ni la base de données, ni la province couverte. La couverture actuelle est le Québec; l’ajout d’une autre province se fait par la couche d’infrastructure, sans changement d’interface.

Une base de référence **indisponible ou non configurée** ne bloque jamais la recherche : l’erreur est journalisée côté serveur, la requête repart vers le fournisseur de géocodage, et l’utilisateur ne voit aucune erreur technique. Lorsque tous les fournisseurs échouent, l’affichage reste celui de `FR-032`.

La lecture passe par le serveur (`/api/geocode`). Aucune clé privilégiée n’est exposée au navigateur, le jeu de données n’est jamais embarqué dans le bundle, et la source publique n’est jamais appelée à chaque frappe : elle ne sert qu’à la synchronisation périodique de la base de référence.

### FR-041 — Enregistrement du parcours en direct et export GPX

Le motocycliste peut enregistrer le parcours **réellement effectué** et l’exporter en fichier `.gpx`. L’enregistrement est **indépendant de tout trajet planifié** : il n’appelle ni l’IA (`FR-034`), ni le fournisseur de routage (`FR-011`, `BR-004`), ni la génération de trajet. Il peut se dérouler pendant une navigation (`FR-023`) sans l’interrompre.

#### Flux

État initial : la carte (`FR-013`) affiche une action principale **Démarrer l’enregistrement**. Au geste :

1. l’autorisation de localisation est demandée si nécessaire;
2. le **flux de localisation partagé** existant est réutilisé (`FR-022`, `FR-023`, `NFR-006`) : aucun second observateur GPS n’est ouvert;
3. les coordonnées valides sont collectées et la trace apparaît progressivement sur la carte.

Pendant l’enregistrement, l’écran affiche en permanence : un indicateur rouge **Enregistrement en cours** doublé d’un libellé texte, le temps écoulé, la distance parcourue, la position actuelle, la ligne du parcours déjà effectué, et un **gros bouton Arrêter** atteignable au pouce.

À l’arrêt : la collecte cesse immédiatement, l’observateur de géolocalisation est libéré, les points déjà enregistrés sont conservés, la carte cadre tout le parcours, un marqueur **Départ** et un marqueur **Arrivée** distincts apparaissent, et deux actions sont proposées : **Sauvegarder en GPX** et **Supprimer**. Le parcours n’est **jamais** sauvegardé automatiquement.

#### Sauvegarde GPX

Le fichier produit est un GPX **1.1** valide, `creator="Ride"`, contenant `<metadata>` (nom, horodatage) puis une trace `<trk>` / `<trkseg>` / `<trkpt>`. Chaque `<trkpt>` conserve la latitude, la longitude et l’horodatage **ISO 8601 UTC**; l’altitude `<ele>` n’est écrite que lorsque l’appareil la fournit. Toute valeur textuelle est échappée en XML.

Le nom de fichier suit la forme `ride-2026-08-25-1430.gpx` (horloge locale) et le type MIME est `application/gpx+xml`. La sortie utilise **Web Share avec fichier** lorsque l’API le supporte (iPhone, PWA), avec un **téléchargement classique** en repli. Les données ne sont supprimées qu’après la création réussie du fichier, et une confirmation claire nomme le fichier créé.

#### Suppression

**Supprimer** demande une confirmation explicite (action irréversible), efface tous les points du parcours courant, retire la ligne et les marqueurs de la carte, revient à l’état initial et ne laisse aucun observateur GPS actif.

#### Qualité des données GPS

Un point conservé porte au minimum latitude, longitude et horodatage, et facultativement altitude, précision, vitesse et cap. Les seuils de filtrage sont des **constantes documentées et testables** du domaine :

- coordonnées non finies, hors bornes, sans horodatage ou nulles (`0, 0`) : ignorées;
- doublons et horodatages non croissants : ignorés;
- premier relevé au-delà d’un seuil de précision strict : ignoré (une puce GPS qui démarre renvoie souvent une position réseau très imprécise);
- relevé ultérieur au-delà du seuil de précision courant : ignoré;
- déplacement sous le seuil d’immobilité : ignoré, afin qu’un arrêt n’accumule pas de points; le filtre étant purement métrique, les **vrais changements de direction sont conservés**;
- saut impliquant une vitesse impossible : ignoré, mais un décalage qui persiste au-delà d’un nombre fixé de relevés est accepté et resynchronise la trace, afin qu’un parcours ne se fige jamais en silence.

La distance est calculée sur les seuls points conservés, par une méthode géographique (Haversine, `BR-004`).

#### États et garanties

Statuts : `idle`, `requesting-permission`, `recording`, `preview`, `exporting`, `error`. La machine d’état interdit deux enregistrements simultanés, deux observateurs GPS actifs, un export de moins de deux points valides, la perte silencieuse d’un parcours (un démarrage ne peut pas écraser un parcours non traité, un échec d’export ne supprime rien) et un observateur encore actif après un arrêt ou une suppression.

#### Erreurs

Des messages compréhensibles — jamais l’erreur technique brute — couvrent la permission refusée, la localisation désactivée, l’absence de signal GPS utilisable, un parcours trop court et l’échec de création ou de partage du fichier GPX. Une perte de signal **en cours** d’enregistrement est signalée sans interrompre la collecte.

La trace est dessinée par le moteur cartographique, dans une couche distincte de celle du trajet planifié (`FR-013`, `BR-004`). La carte simplifiée de repli, utilisée seulement lorsque le contexte WebGL ne démarre pas, continue d’afficher le trajet planifié uniquement.

#### Limite de suivi en arrière-plan

L’enregistrement est un suivi de **premier plan** (`NFR-006`). Ride est une application web installable dans une coque Capacitor (`FR-027`) et n’utilise pas la permission de localisation **Always** ni le mode d’arrière-plan `location` : hors scène CarPlay connectée (`FR-028`), le système suspend la page lorsque l’application passe en arrière-plan ou que l’écran se verrouille, et **aucun relevé n’est garanti** pendant cette suspension. Les points déjà enregistrés sont conservés et la collecte reprend au retour au premier plan. Ride ne promet pas un suivi écran verrouillé.

### FR-042 — Écran de navigation lisible en roulant

Raffinement de l’expérience de navigation (`FR-023`, `FR-024`, `FR-026`, `FR-036`). Aucun second moteur de navigation : la progression, les manœuvres et le hors-trajet restent ceux du fournisseur existant.

#### Carte de manœuvre

En haut de l’écran, en permanence : une grande icône de direction, la distance avant la manœuvre en très gros caractères, l’instruction principale, le nom de la route, et — lorsqu’elle existe — la **manœuvre suivante** sur une ligne discrète (`NavigationProgress.followingStep`). Avant le premier relevé GPS, la distance affiche `—` et jamais `0 m`.

#### Panneau de progression

En bas : heure d’arrivée estimée, temps restant, distance restante, destination rappelée, plus les commandes indispensables — recentrage, guidage vocal, aperçu du trajet et **Terminer**. Terminer demande une confirmation simple, sans rendre l’action difficile d’accès.

#### État toujours explicite

Un seul message d’état à la fois, hiérarchisé du plus actionnable au moins urgent (`deriveNavigationStatus`) : localisation refusée, navigation suspendue, erreur, recalcul en cours, connexion indisponible, sortie de trajet, signal GPS perdu, recherche de position, arrivée, signal faible. **Aucune information n’est portée par la seule couleur** : chaque état porte sa phrase. Une erreur ne laisse jamais une carte vide ni une interface bloquée.

#### Carte pendant la navigation

La portion **parcourue** est visuellement distincte de la portion **restante** (`splitLineStringAtKm`). Le pilote peut déplacer ou zoomer la carte : le suivi automatique se suspend alors, l’interface le dit et propose un bouton de recentrage évident. La caméra n’est **jamais** ramenée de force pendant que le pilote consulte la carte, y compris à l’arrivée d’un itinéraire recalculé. Le trajet reste affiché pendant un recalcul, une coupure réseau ou une perte de signal.

#### Prévisualisation

Après génération, dans la même vue : distance totale, durée estimée, heure d’arrivée, destination visible. **Démarrer la navigation** est l’action principale; **Régénérer** et **Modifier la destination** sont secondaires. Pendant une génération, une progression est affichée avec une action **Annuler**; l’ancien trajet reste visible et une réponse arrivée en retard ne le remplace pas.

#### Conflit avec une session active

Demander un nouveau trajet alors qu’une navigation est en cours ouvre une confirmation explicite (**Terminer et continuer** / **Poursuivre la navigation**). Une session active n’est jamais interrompue en silence, y compris depuis le catalogue CarPlay (`FR-028`).

#### Conception mobile

Cibles tactiles d’au moins 48 × 48 px, contraste élevé de jour comme de nuit (`FR-037`), respect des `safe-area-inset`, portrait **et** paysage, prise en charge de `prefers-reduced-motion` jusque dans les mouvements de caméra, libellés accessibles aux lecteurs d’écran.

---

### FR-044 — Indications sonores

Le guidage vocal (`FR-025`) dit **quoi** faire; une indication sonore dit **qu’il se passe quelque chose**, avant même que la phrase soit comprise. Elle sert de repli lorsque la voix ne peut pas être entendue.

Règles :

- les tonalités sont **synthétisées localement** (Web Audio) : aucun fichier audio, aucun appel réseau, aucun enregistrement;
- la table des tonalités appartient au domaine, de sorte que tout afficheur rejoue la même chose (`BR-004`);
- une indication accompagne chaque seuil d’annonce (`FR-025`) — préparation, approche, manœuvre imminente —, le recalcul hors trajet (`FR-026`) et l’arrivée;
- elle se déclenche **quand le moteur vocal est absent ou en erreur**; tant que la voix fonctionne, elle reste silencieuse pour ne pas doubler l’instruction;
- l’arrivée n’est annoncée qu’une fois; un trajet recalculé peut de nouveau être atteint;
- le contexte audio est déverrouillé par le même geste que la voix, et deux indications ne se superposent jamais;
- le **timbre** des tonalités peut suivre le thème de carte (`FR-046`) : la forme d’onde appartient à la tonalité, dans le domaine, et un afficheur choisit une **voix** parmi celles qu’il décrit. Le thème ne change ni le moment où une indication se déclenche, ni son volume, ni la règle de repli ci-dessus, et changer de thème en roulant ne coupe jamais le son;
- le bouton de coupure du son de l’écran de navigation coupe la voix **et** les indications sonores;
- lorsque la voix est indisponible, le bouton le nomme explicitement, plutôt que de laisser croire à un silence choisi (`FR-042`);
- l’absence de Web Audio ne dégrade que le son : la navigation visuelle continue (`NFR-006`).

### FR-043 — Météo et radar sur la carte

La carte porte le ciel autant que la route. Objectif : savoir **en temps réel dans quelle direction éviter le mauvais temps**, sans quitter la carte ni interpréter un bulletin.

#### Activation

Un bouton **Météo** superposé à la carte (cible ≥ 44 px, état `aria-pressed`) allume et éteint la couche. Elle est **éteinte au démarrage** : aucune requête météo n’est émise tant que le pilote ne la demande pas. Une fois allumée, elle reste disponible pendant la navigation, où l’information sert le plus.

#### Échantillonnage

Le ciel est échantillonné autour du pilote : sa position, puis **trois anneaux dont la densité suit le rayon** — huit points sur le premier, seize sur le deuxième, vingt-quatre sur le troisième (**49 points**, un seul appel fournisseur). Un nombre fixe de points par anneau espacerait l’anneau extérieur trois fois plus que l’intérieur, et une cellule passerait entre deux relevés; en faisant croître le compte avec le rayon, deux voisins restent séparés d’une douzaine de kilomètres sur les trois anneaux. Le champ **couvre** ainsi la surface que l’imagerie radar dessine au lieu de la ponctuer. Rayon par défaut 45 km, borné à 5–200 km. La position est arrondie à une cellule d’environ 0,1° avant l’appel, de sorte qu’un relevé GPS ne déclenche pas une nouvelle requête; la couche se rafraîchit d’elle-même toutes les dix minutes.

#### Nuages

Chaque point non dégagé porte un nuage dont la teinte et les traits suivent le niveau — **nuageux**, **averses**, **pluie**, **orage** — déduit de la probabilité de précipitation, de l’intensité en mm/h, de la couverture nuageuse et du code orage du fournisseur. Le pourcentage de risque accompagne le nuage : **aucune information n’est portée par la seule couleur**, et chaque marqueur porte un nom accessible (« Pluie, 72 % de risque de pluie »). Un ciel dégagé ne reçoit aucun marqueur.

Le nuage est un **personnage**, sur tous les thèmes de carte : un corps plein cerné d’encre, deux yeux, et une **humeur qui suit le niveau** — placide sous un ciel couvert, inquiet sous les averses, triste sous la pluie, fâché sous l’orage. Il est dessiné **assez grand** pour se lire d’un coup d’œil à travers une visière; à cette taille des nuages voisins peuvent se recouvrir sur un cadrage régional, ce qui est assumé — le marqueur est transparent aux gestes, et il n’intercepte donc jamais un déplacement de la carte. L’humeur ne fait que **redire** ce que le niveau dit déjà : le pourcentage et le nom accessible portent l’information (`NFR-001`), et le dessin reste `aria-hidden`.

#### Images radar

Les tuiles radar sont dessinées **sous** le tracé du trajet, jamais au-dessus : une cellule ne masque pas la route. Le pilote peut passer d’une image observée à la prévision immédiate (« Maintenant », « +20 min »), qui est ce qui montre **où va** la cellule. L’attribution du fournisseur d’imagerie est affichée avec la couche.

#### Direction à éviter

À partir du champ échantillonné, l’application calcule pour chacun des huit secteurs (N à NO) le **pire** risque observé — une moyenne laisserait un point sec lointain annuler une cellule proche — et en tire deux phrases : la direction du mauvais temps et la direction encore ouverte (« Mauvais temps vers le sud-ouest (78 %). Évitez le sud-ouest. Le ciel reste ouvert vers le nord-est (12 %). »). À risque égal, la direction proposée est la plus opposée à la cellule. Aucune échappée n’est proposée lorsqu’aucune direction n’est nettement plus dégagée; la couche le dit alors explicitement. L’avis est recalculé depuis la **position exacte** du pilote, même si l’échantillonnage a été fait pour la cellule.

#### États et dégradation

États explicites, comme partout ailleurs (`FR-042`) : couche éteinte, lecture en cours, données affichées, service indisponible. Une panne de l’**imagerie radar** n’empêche pas les nuages ni l’avis de direction : la couche se replie sur les prévisions et le dit. Une panne du fournisseur de **prévisions** est annoncée; elle ne vide jamais la carte ni n’interrompt la navigation.

#### Fournisseurs

Les fournisseurs sont remplaçables (`NFR-005`, `BR-004`) : le domaine ne connaît que des échantillons et des trames. Les fournisseurs par défaut sont publics et sans clé; un mode hors ligne déterministe reste disponible pour le développement et les tests.

Un fournisseur d’imagerie déclare le zoom au-delà duquel il ne sert plus rien : la carte agrandit alors sa dernière image plutôt que de demander des tuiles qui reviendraient en image de remplacement. Deux services sont branchés — l’un mondial avec prévision immédiate mais plafonné en zoom, l’autre nord-américain à 1 km rendu à la demande, sans plafond mais sans prévision. Le choix est une variable d’environnement, jamais une décision du domaine.

### FR-045 — Thème de la carte

Le fond de carte se choisit dans **Réglages** (`FR-031`), sous forme de six thèmes :

- **Automatique** — suit l’apparence de l’interface (`FR-037`) : fond clair en mode clair, fond sombre en mode sombre **et** en navigation nocturne;
- **Clair** — fond de rue clair, lisible en plein soleil;
- **Sombre** — fond de rue sombre, moins éblouissant la nuit;
- **Satellite** — imagerie aérienne;
- **Relief** — relief et courbes de niveau;
- **Kart Arcade** — thème vectoriel expressif (`FR-046`).

Règles :

- **Automatique** est la valeur par défaut;
- contrairement au style de trajet et aux préférences de route, le choix est **durable** : il survit à la fermeture de l’application, comme l’apparence (`FR-037`) et la voix (`FR-025`);
- le changement s’applique **sans démonter la carte** : le tracé, la trace enregistrée (`FR-041`), les marqueurs et la couche météo (`FR-043`) sont redessinés sur le nouveau fond, et la caméra ne bouge pas;
- les thèmes **Satellite** et **Relief** sont matriciels : ils n’offrent pas de bâtiments 3D pendant le suivi de navigation (`FR-024`), sans que ce soit une erreur (`NFR-005`);
- chaque thème affiche l’**attribution** exigée par son fournisseur de tuiles;
- l’échec de chargement d’un thème laisse le fond précédent à l’écran plutôt qu’une carte vide (`NFR-005`); les informations textuelles du trajet ne dépendent jamais du fond (`FR-013`);
- le fournisseur de tuiles reste un détail d’infrastructure (`BR-004`) : le domaine ne connaît que le nom du thème.

---

### FR-046 — Thème de carte Kart Arcade

**Kart Arcade** est un thème de fond de carte optionnel (`FR-045`) : couleurs vives inspirées des jeux de course, sans reprendre aucun personnage, logo, véhicule ni élément graphique appartenant à un tiers. Tous les éléments visuels sont originaux, de sorte que le thème reste utilisable dans une application publique.

Rendu :

- style **MapLibre vectoriel complet** au schéma OpenMapTiles. Le thème ne recolore pas des tuiles matricielles;
- terrain vert chaleureux, avec des surfaces distinctes pour les zones urbaines, les champs, les forêts, les parcs et les plans d’eau;
- eau turquoise, avec un rivage plus foncé;
- routes arrondies à **garde-fou blanc** de chaque côté et **ligne jaune centrale** sur les axes, comme sur la référence visuelle. La chaussée se fond du chaud vers l’asphalte à mesure qu’on approche : vue d’ensemble, une route est un trait de deux pixels qu’un gris sur fond vert ferait disparaître; en vue de rue, c’est une surface. Les autoroutes gardent leur corail à tous les niveaux, les chemins restent pointillés, les ponts ont un contour renforcé et les tunnels sont violets en tirets;
- **chevrons de direction** sur le trajet, dessinés dans le code — Ride n’embarque pas de planche de sprites, et un thème ne doit jamais dépendre d’une ressource qui peut manquer (`NFR-005`). Un moteur sans canevas 2D affiche simplement le trajet sans chevrons;
- épaisseur, contour, visibilité, densité et taille des libellés pilotés par des expressions de zoom : les petites rues n’apparaissent qu’en zoom rapproché;
- **ciel dégradé** au-dessus de l’horizon — turquoise en hauteur, bande pâle à l’horizon, brume claire sur le sol lointain. La caméra inclinée regarde dans un décor plutôt que dans le vide; la brume reste assez lointaine pour ne jamais délaver la route sous le motocycliste;
- bâtiments orangés, extrudés en volumes dès que la ville est à l’écran et nuancés selon leur hauteur, de sorte qu’une agglomération vue de haut se lise en blocs et non en aplat. L’extrusion reste disponible pendant le suivi de navigation lorsque le style le permet (`FR-024`);
- ombrage de relief **facultatif**, activé seulement si une source d’élévation est configurée; son absence n’est pas une erreur (`NFR-005`);
- libellés en encre foncée sur halo clair, hiérarchisés par importance, avec les accents français rendus correctement. Les noms réels des lieux ne sont jamais remplacés.

Trajet actif :

- bleu électrique sur un halo blanc plus large, sous les marqueurs et au-dessus du fond;
- **damier de départ et d’arrivée** posé en travers de la route, orienté par le cap réel du tracé à chaque extrémité. Une boucle en reçoit deux : les caps diffèrent, et c’est ainsi que le sens de parcours se lit;
- **bornes kilométriques** entre les deux, espacées d’un nombre rond de kilomètres choisi pour qu’un trajet n’en porte jamais plus d’une douzaine, quelle que soit sa longueur. Chaque borne affiche sa distance et son unité. Aucune ne se pose dans la dernière demi-portion, pour ne pas heurter le damier d’arrivée;
- damier et bornes sont **dessinés dans le code**, comme les chevrons : Ride n’embarque aucune planche de sprites, et un moteur sans canevas 2D affiche simplement le trajet sans eux (`NFR-005`);
- la géométrie reste exactement celle du moteur de routage : le thème ne touche ni au calcul, ni au recalcul, ni au guidage.

Ciel :

- les nuages de la couche météo (`FR-043`) sont **dessinés dans le code**, originaux comme le damier et les chevrons, et **strictement immobiles** — l’interdiction d’animation permanente vaut pour eux aussi. Ils n’appartiennent pas à ce thème : leur visage est le marqueur météo de tous les thèmes, et changer de fond les redessine sans démonter la carte (`FR-045`).

Deux niveaux de détail :

- **Exploration** — couleurs complètes, détails secondaires, et **caméra inclinée à 45°** pour la profondeur quasi isométrique de la référence;
- **Navigation active** — les couches décoratives sont masquées et le tracé est épaissi, dès que la caméra suit le motocycliste.

La caméra :

- l’inclinaison appartient au thème : le thème standard reste à plat, et le changement de thème incline ou redresse la caméra sans démonter la carte;
- la **navigation garde la sienne** : la caméra de suivi impose son propre angle, et un changement de thème en roulant ne la bouscule jamais;
- un **aperçu de trajet complet est toujours cadré à plat**, quel que soit le thème : un tracé de 90 km vu en enfilade est illisible;
- `prefers-reduced-motion` remplace le mouvement de caméra par une coupe instantanée (`NFR-008`);
- le motocycliste peut redresser ou incliner la carte lui-même; son geste a toujours le dernier mot.

Départ :

- au **premier point GPS** d’une session, un **compte à rebours ponctuel** 3‑2‑1‑GO ! s’affiche au centre de l’écran, sous ce thème seulement. C’est le moment où le guidage commence réellement; un rebours lancé plus tôt se terminerait pendant « Recherche de la position… »;
- il est **strictement décoratif et ne retarde rien** : itinéraire, caméra et voix démarrent en parallèle. Il est transparent aux touches et ne masque ni l’instruction de manœuvre ni le bouton **Terminer**, que le motocycliste peut presser pendant qu’il défile;
- il ne joue **qu’une fois par session**, jamais en boucle — l’interdiction d’animation permanente porte sur la boucle, pas sur un éclat ponctuel;
- il est `aria-hidden` : l’état de la session est déjà annoncé par sa zone `role="status"`, et le rebours ne doit pas parler par-dessus;
- chaque palier porte une tonalité (`FR-044`). Contrairement aux indications de manœuvre, ce court signal n’en double aucune et sonne donc même quand la voix fonctionne. Le bouton de coupure du son le fait taire, et il reste muet quand un écran de véhicule pilote le son (`FR-028`);
- `prefers-reduced-motion` supprime le mouvement sans supprimer les paliers : les chiffres défilent, ils ne grossissent plus (`NFR-008`).

Portée dans l’interface :

- le fond de carte résolu est **publié sur le document**, comme l’apparence (`FR-037`) y pose déjà ses classes. Toute la peau du thème en découle en CSS seul : aucun composant ne connaît le nom du thème, et changer de fond suffit à rendre l’interface à son apparence normale;
- sous Kart Arcade, panneaux, contrôles, boutons et barre d’onglets prennent le **contour épais et l’ombre dure** du thème, avec un jeu de jetons complet pour l’apparence claire comme sombre. Le choix du fond et le choix de l’apparence restent indépendants;
- les **chiffres arcade** peuvent habiller les mesures les plus visibles hors navigation. Ils ne s’appliquent qu’au-dessus de 1,25 rem : plus petit, le contour ferme les contrepoinçons et le chiffre cesse d’être lisible. La valeur complète reste toujours un libellé accessible unique.

Règles :

- le thème est un **choix volontaire** : le défaut reste **Automatique** (`FR-045`), y compris pour les utilisateurs existants;
- la source de tuiles vectorielles, les polices et l’élévation sont **configurables par variables d’environnement**, sans clé dans le code (`NFR-004`);
- l’attribution OpenStreetMap et celle du fournisseur de tuiles restent affichées;
- si le fond ne peut pas être chargé — style illisible ou source de tuiles injoignable — l’application **revient d’elle-même au thème par défaut** plutôt que de laisser une carte vide (`NFR-005`);
- aucune animation permanente; `prefers-reduced-motion` est respecté;
- l’information n’est jamais portée par la couleur seule : les marqueurs gardent leur libellé textuel (`NFR-001`).

---

## 15. Hors périmètre du MVP

Les capacités suivantes sont **hors du MVP**. Elles ne doivent pas être implémentées tant que cette spécification ne les a pas promu au contrat fonctionnel.

- réseau social;
- sorties de groupe;
- suivi de motocyclistes;
- météo;
- recommandations de trajets par intelligence artificielle (suggestion de sorties à l’utilisateur, distincte de l’option `FR-029`, de l’adaptateur de routage RAG, et de la génération à la demande du flux `FR-034`);
- profils de motos;
- automatisation des arrêts carburant;
- intégration Garmin, Google Maps ou Apple Maps;
- localisation en arrière-plan (permission Always / mode `location`);
- fonctionnement avec écran verrouillé **sans** scène CarPlay connectée;
- navigation hors ligne;
- alertes de circulation;
- limites de vitesse;
- alertes police ou dangers;
- données communautaires;
- Android Auto;
- réécriture native Swift, SwiftUI, React Native ou Expo de l’application iPhone;
- application Android;
- publication App Store ou TestFlight (le dépôt fournit le projet Xcode);
- partage de position;
- commentaires publics;
- notes / évaluations de trajets;
- partage de trajets;
- routage adventure avancé (gravel, 80/20, 50/50, etc.);
- péages, traversiers et règles de frontières comme préférences utilisateur;
- scores composites et comparaison simultanée de plusieurs variantes;
- modification interactive avancée du tracé;
- sauvegarde cloud et comptes utilisateur (l’enregistrement d’un parcours et son export GPX restent **locaux à l’appareil**, `FR-041`);
- historique persistant des parcours enregistrés (un seul parcours à la fois, exporté ou supprimé avant le suivant).

Ces éléments peuvent apparaître dans `README.md` ou `CURSOR.md` comme vision élargie ou cible technique. Ils ne font pas partie du contrat fonctionnel actuel.

---

## 16. Fonctionnalités futures

Après le MVP, les évolutions possibles incluent, sans ordre d’engagement :

1. plusieurs variantes distinctes par génération, avec scores de courbes et de paysage;
2. seuil contractuel de chevauchement et régénération avec différence minimale chiffrée;
3. tolérance de distance choisie par l’utilisateur;
4. sauvegarde cloud et comptes utilisateur;
5. ouvertures vers des applications de navigation externes (l’export GPX d’un parcours enregistré fait désormais partie du MVP, `FR-041`);
6. arrêts (stations-service, points de vue, pauses);
7. profils de moto et autonomie;
8. historique persistant des parcours enregistrés, au-delà du parcours courant de `FR-041`;
9. mode « Surprise me »;
10. comptes, synchronisation et partage;
11. styles adventure et découverte;
12. navigation hors ligne, arrière-plan ou écran verrouillé hors CarPlay;
13. application Android;
14. publication App Store;
15. réécriture de l’interface iPhone en Swift ou React Native;
16. Android Auto.

Toute promotion d’une fonctionnalité future vers le MVP doit d’abord mettre à jour cette spécification, puis le code, puis les tests.

---

## 17. Index des exigences

### Exigences fonctionnelles

| ID | Titre |
| --- | --- |
| `FR-001` | Boucle |
| `FR-002` | Départ vers destination |
| `FR-003` | Départ vers destination avec retour par une route différente |
| `FR-004` | Style Curvy |
| `FR-005` | Style Scenic |
| `FR-006` | Style Touring |
| `FR-007` | Éviter les autoroutes |
| `FR-008` | Éviter les routes non pavées |
| `FR-009` | Distance cible |
| `FR-010` | Durée disponible |
| `FR-011` | Génération de trajet |
| `FR-012` | Régénération |
| `FR-013` | Carte |
| `FR-014` | Écran principal |
| `FR-015` | Écran résultat |
| `FR-016` | Flux utilisateur principal |
| `FR-017` | Point de départ (recherche de lieu et adresse de la position actuelle) |
| `FR-018` | Destination |
| `FR-019` | Choix du style de trajet |
| `FR-020` | Statistiques essentielles |
| `FR-021` | Contraintes incompatibles |
| `FR-022` | Suivi GPS de premier plan |
| `FR-023` | Démarrage et arrêt d’une navigation |
| `FR-024` | Instructions de manœuvre |
| `FR-025` | Guidage vocal |
| `FR-026` | Détection hors trajet et recalcul |
| `FR-027` | Coque iOS |
| `FR-028` | Navigation CarPlay |
| `FR-029` | Option de génération par corridors connus (RAG) |
| `FR-030` | Canada seulement |
| `FR-031` | Architecture d’information mobile |
| `FR-032` | Recherche de lieu (états et annulation) |
| `FR-033` | Écran avant le départ |
| `FR-034` | Génération IA depuis la position (Décrire mon trajet) |
| `FR-035` | Destinations récentes et trajets enregistrés locaux |
| `FR-036` | Machine d’état de navigation |
| `FR-037` | Modes clair, sombre et navigation nocturne |
| `FR-038` | Trouver une destination (position actuelle → aperçu → navigation) |
| `FR-039` | Import GPX et navigation sur la trace |
| `FR-040` | Recherche de destination par code postal canadien |
| `FR-041` | Enregistrement du parcours en direct et export GPX |
| `FR-042` | Écran de navigation lisible en roulant |
| `FR-043` | Météo et radar sur la carte |
| `FR-044` | Indications sonores |
| `FR-045` | Thème de la carte |
| `FR-046` | Thème de carte Kart Arcade |

### Règles métier

| ID | Titre |
| --- | --- |
| `BR-001` | Tolérance de distance ±10 % |
| `BR-002` | Minimiser les routes répétées |
| `BR-003` | Priorité du style sur la route la plus rapide |
| `BR-004` | Indépendance du domaine vis-à-vis des fournisseurs |
| `BR-005` | Conversion durée → distance estimée |
| `BR-006` | Différence minimale à la régénération |
| `BR-007` | Pas de relâchement silencieux des contraintes de surface connues |
| `BR-008` | Préservation des préférences lors du recalcul |
| `BR-009` | Pas de relâchement silencieux du passage aux États-Unis |
| `BR-010` | Géométrie GPX autoritaire |

### Exigences non fonctionnelles

| ID | Titre |
| --- | --- |
| `NFR-001` | Mobile first |
| `NFR-002` | Simplicité |
| `NFR-003` | Maintenabilité |
| `NFR-004` | Sécurité d’usage |
| `NFR-005` | Remplaçabilité des fournisseurs |
| `NFR-006` | Navigation sécuritaire de premier plan |
| `NFR-007` | Conteneur natif remplaçable |
