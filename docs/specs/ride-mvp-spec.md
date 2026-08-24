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
6. activer les préférences d’évitement d’autoroutes et de routes non pavées;
7. générer un trajet;
8. le visualiser sur une carte avec les statistiques essentielles;
9. régénérer une variante sensiblement différente;
10. suivre sa position actuelle sur la carte, uniquement au premier plan et après une action volontaire (`FR-022`);
11. démarrer une navigation virage par virage de premier plan, avec instructions, guidage vocal et recalcul hors trajet (`FR-023`, `FR-024`, `FR-025`, `FR-026`);
12. ouvrir le même flux depuis une coque iOS installable (`FR-027`), sans changer les règles métier.

Le succès du MVP se mesure à la capacité de produire un trajet compréhensible, conforme aux contraintes autant que le réseau routier le permet, avant le départ. La navigation assistée, une fois le trajet généré, reste limitée au premier plan.

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

Cette conversion appartient au domaine. Elle ne doit pas être déléguée implicitement à un fournisseur de routage. Les constantes de vitesse utilisées pour l’estimation doivent rester ajustables sans changer d’adaptateur externe.

---

## 6. Styles de trajet

Le MVP prend en charge exactement trois styles. L’utilisateur en choisit un avant la génération (`FR-019`).

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

### FR-019 — Choix du style de trajet

L’écran principal doit permettre de choisir un et un seul style parmi Curvy, Scenic et Touring avant la génération. Le style sélectionné oriente le classement et la construction du trajet.

### BR-003 — Priorité du style sur la route la plus rapide

Sauf demande explicite contraire, le générateur ne doit pas réduire le problème à un plus court chemin temporel. Le style demandé (`FR-004`, `FR-005` ou `FR-006`) guide la sélection des corridors, y compris si le résultat n’est pas le plus rapide.

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

---

## 8. Génération et régénération

### FR-011 — Génération de trajet

À partir d’une demande valide, le système génère un trajet conforme au type, au style et aux préférences.

La génération doit :

1. valider la demande;
2. produire un ou plusieurs candidats internes;
3. normaliser le résultat en un trajet du domaine (géométrie, distance, durée, statistiques);
4. vérifier les règles métier (`BR-001`, `BR-002`, `BR-003`, `BR-007`);
5. retourner un trajet utilisable **ou** une erreur métier explicite.

Le MVP affiche **un trajet principal** à la fois. La comparaison de plusieurs variantes simultanées n’est pas requise dans ce périmètre.

Le domaine évalue les candidats. Le fournisseur de routage calcule des chemins; il ne décide pas des règles métier. Un adaptateur RAG récupère des corridors connus puis compose un tracé : il reste un calculateur de chemins, pas un moteur de règles.

### FR-012 — Régénération

L’utilisateur peut demander une nouvelle route à partir des mêmes critères.

La régénération doit :

- conserver le type, le style, les points et les préférences de la demande initiale;
- tenter de produire un corridor **sensiblement différent** du trajet précédent;
- rester soumise à `BR-001`, `BR-002` et aux préférences d’évitement.

### BR-006 — Différence minimale à la régénération

Une régénération ne doit pas se limiter à un micro-ajustement du même corridor. Le système doit tenter de minimiser le réemploi des segments du trajet précédent.

Le seuil exact de différence peut évoluer. Pour le MVP, une régénération est acceptable si l’utilisateur peut constater un corridor visiblement différent, sauf impossibilité expliquée du réseau routier.

### FR-021 — Contraintes incompatibles

Si aucune route ne respecte l’ensemble des contraintes, le système doit :

- l’expliquer en langage clair;
- indiquer la ou les contraintes en cause (distance, autoroutes, surface, chevauchement, etc.);
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

La carte est un moyen d’affichage. Le composant cartographique, les tuiles et le SDK utilisés sont des détails d’infrastructure (`BR-004`, `NFR-005`). Une indisponibilité de la carte ou du suivi GPS ne doit pas faire disparaître les informations textuelles du résultat (distance, durée, avertissements).

La modification interactive avancée du tracé (ajout, déplacement ou suppression d’étapes) n’est pas requise dans le MVP.

### FR-022 — Suivi GPS de premier plan

Après une génération réussie, l’utilisateur peut afficher et suivre sa position actuelle sur la carte.

Le suivi GPS :

- est **volontaire** : il commence uniquement lorsque l’utilisateur active le contrôle de localisation;
- fonctionne uniquement lorsque l’application est ouverte au **premier plan**;
- ne conserve aucune position (ni base de données, ni `localStorage`, ni cookie, ni journal);
- ne partage aucune position avec un tiers au-delà de l’appel serveur de géocodage inverse effectué une seule fois lors du choix de « Ma position » (`FR-017`);
- ne constitue **pas** à lui seul une navigation virage par virage (`FR-023`);
- ne demande aucune permission de localisation en arrière-plan.

La permission de géolocalisation n’est demandée qu’après une action explicite : le bouton « Ma position » ou le contrôle GPS de la carte. Aucune position n’est demandée automatiquement au chargement de la page.

Le géocodage inverse de « Ma position » n’est exécuté **qu’une fois** à la sélection. Les mises à jour du suivi GPS sur la carte ne sont pas géocodées et ne remplacent pas le point de départ.

Une erreur de suivi GPS ne doit pas faire disparaître le trajet, la distance, la durée ou les avertissements.

Le domaine ne dépend ni de MapLibre ni d’un fournisseur de géocodage nommé (`BR-004`, `NFR-003`, `NFR-005`).

---

## 10. Flux utilisateur

### FR-016 — Flux utilisateur principal

Le parcours MVP est le suivant :

1. Ouvrir l’écran principal (`FR-014`), y compris via la coque iOS (`FR-027`).
2. Saisir ou sélectionner le point de départ (`FR-017`), y compris via la position actuelle dont l’adresse est alors affichée.
3. Choisir le type de trajet : boucle, départ vers destination, ou aller-retour différent.
4. Saisir la destination si le type l’exige (`FR-018`).
5. Indiquer une distance cible (`FR-009`) et/ou une durée disponible (`FR-010`).
6. Choisir un style (`FR-019`).
7. Activer au besoin « éviter les autoroutes » (`FR-007`) et « éviter les routes non pavées » (`FR-008`).
8. Lancer la génération (`FR-011`).
9. Consulter le résultat sur la carte et dans le panneau de synthèse (`FR-013`, `FR-015`, `FR-020`).
10. Régénérer si le trajet ne convient pas (`FR-012`).
11. Activer au besoin le suivi GPS de premier plan sur la carte (`FR-022`).
12. Démarrer une navigation de premier plan si le trajet convient (`FR-023`, `FR-024`, `FR-025`, `FR-026`).

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

L’écran principal permet de composer la demande de génération. Il contient au minimum :

- le point de départ, avec l’adresse du lieu sélectionné ou de la position actuelle (`FR-017`);
- le type de trajet;
- la destination, uniquement si le type l’exige;
- la distance cible et/ou la durée disponible;
- le style de trajet;
- les options « éviter les autoroutes » et « éviter les routes non pavées »;
- une action principale unique de génération.

L’écran est conçu pour le pouce sur smartphone. Les choix importants utilisent des contrôles larges plutôt que de longues listes.

### FR-015 — Écran résultat

L’écran résultat s’affiche après une génération réussie. Il contient au minimum :

- la carte du trajet (`FR-013`);
- les statistiques essentielles (`FR-020`);
- les avertissements métier, le cas échéant;
- une action de régénération (`FR-012`);
- une action **Démarrer la navigation** (`FR-023`);
- un moyen de revenir modifier la demande.

Sur smartphone, la carte occupe la partie supérieure et le panneau d’information reste accessible sans masquer entièrement le tracé. Les trajets générés ne sont pas encore persistés : la session de navigation reçoit le trajet déjà en mémoire. Elle ne sérialise pas la géométrie dans l’URL et ne l’enregistre pas dans `localStorage`.

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

L’adaptateur de routage par connaissance est un pipeline RAG optionnel (`ROUTING_PROVIDER=ai-rag`) :

1. indexer un graphe routier **local** dont chaque arête est un document (géométrie d’arête, pas une forme géométrique dilatée);
2. récupérer les arêtes par proximité spatiale et par pertinence (type de trajet, style);
3. composer un chemin **uniquement** sur les arêtes récupérées;
4. si aucun corridor connu ne relie la demande, renvoyer une erreur métier explicite (`FR-021`).

Tant qu’aucun réseau routier réel n’est branché, `ROUTING_PROVIDER=mock` reste la valeur par défaut afin que le mode simulé soit explicite. `ai-rag` réutilise le même type de graphe local déterministe; il n’invente pas de coordonnées par transformation d’une courbe, et n’appelle pas un modèle distant.

Ce pipeline est un détail d’infrastructure. Il ne constitue pas une fonctionnalité de recommandation de sorties. Un remplacement par un moteur de graphe routier nommé reste possible via la même interface interne.

---

## 14. Navigation virage par virage de premier plan

La navigation assistée fait partie du contrat fonctionnel, **uniquement au premier plan**. Elle ne prétend pas fonctionner lorsque l’écran est verrouillé ou que l’application est suspendue.

### FR-023 — Démarrage et arrêt d’une navigation

Après une génération réussie, l’utilisateur peut démarrer une session de navigation sur le trajet déjà en mémoire.

Le démarrage :

- n’a lieu qu’après une action explicite de l’utilisateur;
- n’active le suivi GPS (`watchPosition`) qu’à ce moment;
- n’active le guidage vocal qu’après cette action;
- réutilise **une seule** souscription de localisation pour la carte et la navigation;
- affiche clairement que l’application doit rester ouverte au premier plan.

L’arrêt, le retour à l’écran résultat ou le démontage :

- interrompent immédiatement le suivi GPS;
- annulent le guidage vocal en cours;
- ignorent tout recalcul en vol;
- ne conservent aucune position GPS.

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

Cette présentation n’ajoute aucune capacité hors contrat. Elle ne constitue pas une intégration Google Maps (`BR-004`).

Les types de manœuvre du domaine sont indépendants de tout fournisseur (`BR-004`) : départ, arrivée, continuer, tourner, demi-tour, bifurcation, fusion, entrée et sortie d’autoroute, fin de route, rond-point (avec numéro de sortie), changement de nom de route, et manœuvre inconnue avec repli sécuritaire.

Une valeur de manœuvre inconnue d’un fournisseur ne doit pas faire échouer tout le trajet. Le système conserve les données utiles disponibles et utilise une instruction générique du type « Continuez sur la route ».

La progression est calculée localement sur la géométrie. Une hystérésis évite qu’un bruit GPS fasse avancer et reculer les instructions. Une précision trop faible affiche un avertissement et ne déclenche ni fausse manœuvre ni recalcul.

### FR-025 — Guidage vocal

Le guidage vocal utilise uniquement l’API Web Speech `speechSynthesis` du navigateur.

Contraintes :

- aucune synthèse distante;
- aucun enregistrement audio;
- voix préférée `fr-CA`, puis `fr-FR`, puis une autre voix française, puis la voix disponible avec le texte français;
- si `speechSynthesis` est indisponible, la navigation visuelle continue;
- l’utilisateur peut couper et réactiver le son;
- chaque seuil d’annonce n’est prononcé qu’une fois par manœuvre.

Les seuils par défaut, configurables et testés, sont :

- préparation à environ 500 m;
- approche à environ 150 m;
- manœuvre imminente à environ 40 m.

Lors d’un recalcul, les annonces devenues obsolètes sont annulées. La file vocale est remplacée. Deux annonces ne se superposent jamais.

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
- conserve le style, `avoidHighways` et `avoidUnpaved` (`BR-008`);
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

Un recalcul (`FR-026`) conserve le type de trajet, le style (`FR-004`, `FR-005`, `FR-006`) et les préférences d’évitement (`FR-007`, `FR-008`). Il ne relâche pas silencieusement une contrainte de surface connue (`BR-007`) et ne change pas le problème en plus court chemin vers le départ.

### NFR-006 — Navigation sécuritaire de premier plan

La navigation est conçue pour un smartphone tenu ou fixé, application ouverte. Elle :

- utilise des cibles tactiles d’au moins 48 × 48 px;
- évite toute configuration complexe pendant que la moto roule;
- n’utilise qu’une seule souscription `watchPosition()` à la fois, avec `enableHighAccuracy` et `maximumAge: 0`;
- nettoie toujours cette souscription à l’arrêt ou au démontage;
- n’envoie une position au serveur que pour un recalcul réellement nécessaire;
- ne journalise aucune coordonnée;
- ne sauvegarde aucune position GPS;
- ne demande aucune permission de localisation en arrière-plan;
- ne prétend pas fonctionner écran verrouillé ou application suspendue.

Une erreur de carte, de voix ou de GPS ne doit pas provoquer une boucle de requêtes.

### NFR-007 — Conteneur natif remplaçable

La coque iOS (`FR-027`) est un **détail d’infrastructure**. Capacitor, WKWebView, les plugins de localisation, de barre de statut ou de verrouillage d’écran ne doivent pas apparaître dans le domaine.

Un remplacement du conteneur (autre WebView, autre pont natif) ne doit pas obliger à réécrire les règles métier, le générateur ou le calcul de navigation (`BR-004`, `NFR-003`).

### FR-027 — Coque iOS

L’application MVP peut s’ouvrir comme une application iPhone : icône, écran de lancement, barre de statut et zones sûres (encoche, indicateur d’accueil).

La coque :

- expose le même flux que le web (`FR-014` à `FR-016`);
- réutilise la même carte, le même GPS de premier plan et la même navigation (`FR-013`, `FR-022` à `FR-026`);
- demande uniquement la localisation **lorsque l’app est utilisée** (`NSLocationWhenInUseUsageDescription`);
- n’active aucun mode d’arrière-plan de localisation;
- ne prétend pas fonctionner écran verrouillé, en arrière-plan ou hors ligne.

Le guidage vocal reste `speechSynthesis` (`FR-025`). Pendant une navigation démarrée (`FR-023`), la coque peut empêcher la mise en veille de l’écran tant que l’app reste au premier plan (`NFR-006`). Safari et l’ordinateur conservent les adaptateurs navigateur existants.

---

## 15. Hors périmètre du MVP

Les capacités suivantes sont **hors du MVP**. Elles ne doivent pas être implémentées tant que cette spécification ne les a pas promu au contrat fonctionnel.

- réseau social;
- sorties de groupe;
- suivi de motocyclistes;
- météo;
- recommandations de trajets par intelligence artificielle (suggestion de sorties à l’utilisateur, distincte de l’adaptateur de routage RAG qui calcule un chemin à la demande);
- profils de motos;
- automatisation des arrêts carburant;
- import / export GPX;
- intégration Garmin, Google Maps ou Apple Maps;
- localisation en arrière-plan;
- fonctionnement avec écran verrouillé;
- navigation hors ligne;
- alertes de circulation;
- limites de vitesse;
- alertes police ou dangers;
- données communautaires;
- Android Auto et Apple CarPlay;
- réécriture native Swift, SwiftUI, React Native ou Expo;
- application Android;
- publication App Store ou TestFlight (le dépôt fournit le projet Xcode);
- partage de position;
- enregistrement de l’historique GPS;
- commentaires publics;
- notes / évaluations de trajets;
- partage de trajets;
- routage adventure avancé (gravel, 80/20, 50/50, etc.);
- péages, traversiers et règles de frontières comme préférences utilisateur;
- scores composites et comparaison simultanée de plusieurs variantes;
- modification interactive avancée du tracé;
- sauvegarde cloud, comptes utilisateur et historique des routes parcourues.

Ces éléments peuvent apparaître dans `README.md` ou `CURSOR.md` comme vision élargie ou cible technique. Ils ne font pas partie du contrat fonctionnel actuel.

---

## 16. Fonctionnalités futures

Après le MVP, les évolutions possibles incluent, sans ordre d’engagement :

1. plusieurs variantes distinctes par génération, avec scores de courbes et de paysage;
2. seuil contractuel de chevauchement et régénération avec différence minimale chiffrée;
3. tolérance de distance choisie par l’utilisateur;
4. sauvegarde locale d’un trajet;
5. export GPX et ouvertures vers des applications de navigation externes;
6. arrêts (stations-service, points de vue, pauses);
7. profils de moto et autonomie;
8. historique des routes déjà parcourues;
9. mode « Surprise me »;
10. comptes, synchronisation et partage;
11. styles adventure et découverte;
12. navigation hors ligne, arrière-plan ou écran verrouillé;
13. application Android;
14. publication App Store;
15. réécriture de l’interface en Swift ou React Native.

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
