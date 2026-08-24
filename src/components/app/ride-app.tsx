"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RideMap } from "@/components/map/ride-map";
import {
  RideRequestForm,
  type RideRequestFormProps,
} from "@/components/ride-form/ride-request-form";
import {
  LocateButton,
  PlaceSearchField,
} from "@/components/ride-form/place-search-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AppTabBar, type AppTab } from "@/components/shell/app-tab-bar";
import { MapBottomPanel } from "@/components/shell/map-bottom-panel";
import { useAppearance } from "@/components/theme/appearance-provider";
import type { Place } from "@/domain/geo/types";
import type { SavedRide } from "@/domain/library/types";
import { savedRideName } from "@/domain/library/types";
import {
  parseNaturalLanguageRide,
  type NaturalLanguageRideDraft,
} from "@/domain/ride/parse-natural-language";
import type {
  GenerateRideRequest,
  GeneratedRideRoute,
} from "@/domain/ride/types";
import { createCarPlayDisplay } from "@/infrastructure/carplay/create-carplay-display";
import {
  findRecentPlaceByCatalogId,
  parseCarPlayCatalogId,
  toCarPlayCatalog,
} from "@/infrastructure/carplay/map-carplay-catalog";
import { createLocalRideLibrary } from "@/infrastructure/persistence/local-ride-library";
import { createRideSessionStore } from "@/infrastructure/persistence/ride-session-store";
import type { AppearanceMode } from "@/domain/appearance/appearance";
import { formatDistanceLabel, formatDurationLabel } from "@/components/navigation/format-navigation";

type ExplorerSheet = "home" | "search" | "describe" | "planner";

export function RideApp(props: RideRequestFormProps) {
  const library = useMemo(() => {
    const storage = typeof window === "undefined" ? null : window.localStorage;
    return createLocalRideLibrary(storage);
  }, []);
  const sessionStore = useMemo(() => {
    const storage = typeof window === "undefined" ? null : window.sessionStorage;
    return createRideSessionStore(storage);
  }, []);
  const { mode, setMode } = useAppearance();

  const [tab, setTab] = useState<AppTab>("explore");
  const [sheet, setSheet] = useState<ExplorerSheet>("home");
  const [navigating, setNavigating] = useState(false);
  const [route, setRoute] = useState<GeneratedRideRoute | null>(null);
  const [request, setRequest] = useState<GenerateRideRequest | null>(null);
  const [seed, setSeed] = useState<RideRequestFormProps["seed"]>(null);
  const [plannerType, setPlannerType] = useState<"loop" | "destination" | "round_trip">(
    "loop",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPlace, setSearchPlace] = useState<Place | null>(null);
  const [describeText, setDescribeText] = useState("");
  const [describeDraft, setDescribeDraft] = useState(
    parseNaturalLanguageRide(""),
  );
  const [gpsLabel, setGpsLabel] = useState("Position non demandée");
  const [gpsPlace, setGpsPlace] = useState<Place | null>(null);
  const [plannerDraft, setPlannerDraft] =
    useState<NaturalLanguageRideDraft | null>(null);
  const [recents, setRecents] = useState<Place[]>([]);
  const [saved, setSaved] = useState<SavedRide[]>([]);
  const [sessionRides, setSessionRides] = useState<SavedRide[]>([]);
  const [formKey, setFormKey] = useState(0);
  const requestRef = useRef(request);
  const routeRef = useRef(route);
  const recentsRef = useRef(recents);
  const savedRef = useRef(saved);
  const navigatingRef = useRef(navigating);
  const carPlay = useMemo(() => createCarPlayDisplay(), []);

  useEffect(() => {
    requestRef.current = request;
    routeRef.current = route;
    recentsRef.current = recents;
    savedRef.current = saved;
    navigatingRef.current = navigating;
  }, [request, route, recents, saved, navigating]);

  useEffect(() => {
    /* Client storage is unavailable during SSR; hydrate after mount (FR-035). */
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage hydrate */
    setRecents(library.listRecents());
    setSaved(library.listSaved());
    const restored = sessionStore.read();
    if (restored) {
      setRoute(restored.route);
      setRequest(restored.request);
      setSessionRides([
        {
          id: restored.route.id,
          name: savedRideName(restored.route),
          savedAtMs: restored.savedAtMs,
          request: restored.request,
          route: restored.route,
        },
      ]);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [library, sessionStore]);

  useEffect(() => {
    if (!request || !route) {
      return;
    }
    sessionStore.write({
      request,
      route,
      navigating,
      muted: false,
      useKnowledgeRouting: false,
      savedAtMs: Date.now(),
    });
  }, [navigating, request, route, sessionStore]);

  function openPlanner(next: {
    type: "loop" | "destination" | "round_trip";
    destination?: Place | null;
    seed?: RideRequestFormProps["seed"];
    draft?: NaturalLanguageRideDraft | null;
  }) {
    setPlannerType(next.type);
    setSearchPlace(next.destination ?? null);
    setSeed(next.seed ?? null);
    setPlannerDraft(next.draft ?? null);
    setFormKey((value) => value + 1);
    setSheet("planner");
    setTab("explore");
    setNavigating(false);
  }

  function remember(place: Place) {
    library.rememberPlace(place);
    setRecents(library.listRecents());
  }

  useEffect(() => {
    const catalog = toCarPlayCatalog({
      recents,
      saved,
      resumeTitle: route && request ? savedRideName(route) : null,
      resumeSubtitle: route ? formatDistanceLabel(route.distanceKm) : null,
    });
    void carPlay.setCatalog?.(catalog);
  }, [carPlay, recents, saved, request, route]);

  useEffect(() => {
    return carPlay.subscribe((event) => {
      if (event.type !== "catalogSelect") {
        return;
      }
      const parsed = parseCarPlayCatalogId(event.id);
      if (!parsed) {
        return;
      }
      if (parsed.type === "resume") {
        if (navigatingRef.current) {
          return;
        }
        const currentRequest = requestRef.current;
        const currentRoute = routeRef.current;
        if (currentRequest && currentRoute) {
          openPlanner({
            type: currentRequest.type,
            seed: {
              request: currentRequest,
              route: currentRoute,
            },
          });
        }
        return;
      }
      if (parsed.type === "recent") {
        const place = findRecentPlaceByCatalogId(
          recentsRef.current,
          event.id,
        );
        if (place) {
          openPlanner({ type: "destination", destination: place });
        }
        return;
      }
      const item = savedRef.current.find((ride) => ride.id === parsed.id);
      if (item) {
        openPlanner({
          type: item.request.type,
          seed: {
            request: item.request,
            route: item.route,
          },
        });
      }
    });
  }, [carPlay]);

  const planner = (
    <RideRequestForm
      key={formKey}
      {...props}
      chrome="plain"
      hideMap={!navigating}
      initialType={plannerType}
      initialStart={plannerDraft?.startQuery ? null : gpsPlace}
      initialDestination={searchPlace}
      initialDraft={plannerDraft}
      seed={seed}
      onRequestComposed={(composed) => {
        requestRef.current = composed;
        setRequest(composed);
        remember(composed.start);
        if (composed.type !== "loop") {
          remember(composed.destination);
        }
        props.onRequestComposed?.(composed);
      }}
      onGeneratedRouteChange={(next) => {
        setRoute(next);
        const composed = requestRef.current;
        if (next && composed) {
          setSessionRides((current) => [
            {
              id: next.id,
              name: savedRideName(next),
              savedAtMs: Date.now(),
              request: composed,
              route: next,
            },
            ...current.filter((item) => item.id !== next.id),
          ]);
        }
      }}
      onNavigatingChange={setNavigating}
      onSaveRide={(nextRoute, nextRequest) => {
        const item: SavedRide = {
          id: nextRoute.id,
          name: savedRideName(nextRoute),
          savedAtMs: Date.now(),
          request: nextRequest,
          route: nextRoute,
        };
        library.save(item);
        setSaved(library.listSaved());
      }}
    />
  );

  return (
    <div className="relative flex h-dvh min-h-dvh flex-col bg-background text-foreground">
      <div className="relative min-h-0 flex-1">
        {tab === "explore" && !navigating ? (
          <div className="absolute inset-0">
            <RideMap
              route={route}
              engine={props.mapEngine}
              expanded={false}
            />
          </div>
        ) : null}

        {tab === "explore" && sheet === "planner" ? (
          <div
            className={
              navigating
                ? "absolute inset-0 z-40"
                : "pointer-events-none absolute inset-x-0 bottom-0 z-10 flex max-h-full flex-col justify-end"
            }
          >
            <div
              className={
                navigating
                  ? "h-full"
                  : "pointer-events-auto max-h-[85dvh] overflow-y-auto rounded-t-3xl border border-border bg-card/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg"
              }
            >
              {navigating ? null : (
                <>
                  <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted-foreground/40" />
                  <h1 className="mb-3 text-xl font-semibold tracking-tight">
                    Composer le trajet
                  </h1>
                </>
              )}
              {planner}
              {navigating ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-2 min-h-12 w-full"
                  onClick={() => setSheet("home")}
                >
                  Retour
                </Button>
              )}
            </div>
          </div>
        ) : null}

        {tab === "explore" && !navigating && sheet !== "planner" ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
            {sheet === "home" ? (
              <MapBottomPanel title="Où veux-tu rouler?">
                <p className="mb-2 text-sm text-muted-foreground">{gpsLabel}</p>
                <div className="mb-3">
                  <LocateButton
                    requestCoordinates={props.requestCoordinates}
                    reversePlace={props.reversePlace}
                    onLocated={(place, warning) => {
                      setGpsPlace(place);
                      setGpsLabel(warning ?? place.label);
                    }}
                    onError={(message) => {
                      setGpsLabel(message);
                    }}
                  />
                </div>
                <div className="grid gap-2">
                  <Button
                    type="button"
                    size="lg"
                    className="min-h-12 w-full text-base"
                    onClick={() => setSheet("search")}
                  >
                    Rechercher une destination
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="min-h-12 w-full text-base"
                    onClick={() => openPlanner({ type: "loop" })}
                  >
                    Créer une boucle moto
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="min-h-12 w-full text-base"
                    onClick={() => setSheet("describe")}
                  >
                    Décrire mon trajet
                  </Button>
                  {route && request ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="lg"
                      className="min-h-12 w-full text-base"
                      onClick={() =>
                        openPlanner({
                          type: request.type,
                          seed: { request, route },
                        })
                      }
                    >
                      Reprendre la navigation
                    </Button>
                  ) : null}
                </div>
                {recents.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    <h2 className="text-sm font-medium">Destinations récentes</h2>
                    {recents.map((place) => (
                      <Button
                        key={`${place.label}-${place.coordinates.latitude}`}
                        type="button"
                        variant="ghost"
                        className="min-h-12 w-full justify-start text-base"
                        onClick={() =>
                          openPlanner({ type: "destination", destination: place })
                        }
                      >
                        {place.label}
                      </Button>
                    ))}
                  </div>
                ) : null}
                {saved.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    <h2 className="text-sm font-medium">Trajets favoris</h2>
                    {saved.slice(0, 3).map((item) => (
                      <Button
                        key={item.id}
                        type="button"
                        variant="ghost"
                        className="min-h-12 w-full justify-start text-base"
                        onClick={() =>
                          openPlanner({
                            type: item.request.type,
                            seed: { request: item.request, route: item.route },
                          })
                        }
                      >
                        {item.name}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </MapBottomPanel>
            ) : null}

            {sheet === "search" ? (
              <MapBottomPanel title="Rechercher une destination">
                <PlaceSearchField
                  id="explorer-destination"
                  label="Destination"
                  query={searchQuery}
                  selectedPlace={searchPlace}
                  placeholder="Nom, adresse ou lieu"
                  debounceMs={props.debounceMs}
                  searchPlaces={props.searchPlaces}
                  onQueryChange={(query) => {
                    setSearchQuery(query);
                    setSearchPlace(null);
                  }}
                  onPlaceSelected={(place) => {
                    setSearchPlace(place);
                    remember(place);
                    openPlanner({ type: "destination", destination: place });
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-3 min-h-12 w-full"
                  onClick={() => setSheet("home")}
                >
                  Retour
                </Button>
              </MapBottomPanel>
            ) : null}

            {sheet === "describe" ? (
              <MapBottomPanel title="Décrire mon trajet">
                <Label htmlFor="describe-ride">Votre demande</Label>
                <Textarea
                  id="describe-ride"
                  className="mt-2 min-h-28 text-base"
                  placeholder="Crée une boucle de 250 km au départ de Granby, avec des routes sinueuses, sans autoroute et uniquement asphaltées."
                  value={describeText}
                  onChange={(event) => {
                    setDescribeText(event.target.value);
                    setDescribeDraft(parseNaturalLanguageRide(event.target.value));
                  }}
                />
                <p className="mt-2 text-sm text-muted-foreground">
                  L’IA ne trace pas la route : ces critères seront calculés par le
                  moteur de routage.
                </p>
                {describeDraft.unsupported.map((warning) => (
                  <p key={warning} className="mt-1 text-sm text-muted-foreground">
                    {warning}
                  </p>
                ))}
                <Button
                  type="button"
                  size="lg"
                  className="mt-3 min-h-12 w-full text-base"
                  onClick={() => {
                    openPlanner({
                      type: describeDraft.type,
                      draft: describeDraft,
                    });
                  }}
                >
                  Continuer avec ces critères
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-2 min-h-12 w-full"
                  onClick={() => setSheet("home")}
                >
                  Retour
                </Button>
              </MapBottomPanel>
            ) : null}
          </div>
        ) : null}

        {tab === "rides" && !navigating ? (
          <LibraryList
            title="Mes trajets"
            empty="Aucun trajet généré dans cette session."
            items={sessionRides}
            onStart={(item) =>
              openPlanner({
                type: item.request.type,
                seed: { request: item.request, route: item.route },
              })
            }
          />
        ) : null}

        {tab === "saved" && !navigating ? (
          <LibraryList
            title="Enregistrés"
            empty="Aucun trajet enregistré sur cet appareil."
            items={saved}
            onStart={(item) =>
              openPlanner({
                type: item.request.type,
                seed: { request: item.request, route: item.route },
              })
            }
            onRemove={(item) => {
              library.remove(item.id);
              setSaved(library.listSaved());
            }}
          />
        ) : null}

        {tab === "settings" && !navigating ? (
          <SettingsPanel
            mode={mode}
            onMode={setMode}
            gpsLabel={gpsLabel}
            onGpsLabel={setGpsLabel}
          />
        ) : null}
      </div>
      <AppTabBar value={tab} onChange={setTab} hidden={navigating} />
    </div>
  );
}

function LibraryList({
  title,
  empty,
  items,
  onStart,
  onRemove,
}: {
  title: string;
  empty: string;
  items: SavedRide[];
  onStart: (item: SavedRide) => void;
  onRemove?: (item: SavedRide) => void;
}) {
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-background px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {items.length === 0 ? (
        <p className="mt-4 text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-border px-3 py-3"
            >
              <p className="font-medium">{item.name}</p>
              <p className="text-sm text-muted-foreground">
                {formatDistanceLabel(item.route.distanceKm)} ·{" "}
                {formatDurationLabel(item.route.durationMinutes)}
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  className="min-h-12 flex-1"
                  onClick={() => onStart(item)}
                >
                  Démarrer
                </Button>
                {onRemove ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-12"
                    onClick={() => onRemove(item)}
                  >
                    Retirer
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SettingsPanel({
  mode,
  onMode,
  gpsLabel,
  onGpsLabel,
}: {
  mode: AppearanceMode;
  onMode: (mode: AppearanceMode) => void;
  gpsLabel: string;
  onGpsLabel: (label: string) => void;
}) {
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-background px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
      <h1 className="text-2xl font-semibold tracking-tight">Réglages</h1>
      <fieldset className="mt-4 space-y-2">
        <legend className="text-sm font-medium">Apparence</legend>
        {(
          [
            ["dark", "Sombre"],
            ["light", "Clair"],
            ["night", "Navigation nocturne"],
            ["system", "Système"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            className="flex min-h-12 w-full items-center rounded-lg border border-border px-3 text-left text-base"
            onClick={() => onMode(value)}
          >
            {label}
          </button>
        ))}
      </fieldset>
      <p className="mt-6 text-sm text-muted-foreground">
        Ride est une application web dans une coque iOS. Apple CarPlay n’est pas
        une page web : il s’agit d’un afficheur natif. Voir la documentation
        d’architecture CarPlay.
      </p>
      <p className="mt-3 text-sm text-muted-foreground">GPS : {gpsLabel}</p>
      <Button
        type="button"
        variant="outline"
        className="mt-2 min-h-12"
        onClick={() => onGpsLabel("Position demandée uniquement à l’action.")}
      >
        Comprendre la localisation
      </Button>
    </div>
  );
}
