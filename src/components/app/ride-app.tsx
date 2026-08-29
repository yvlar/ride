"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RideMap } from "@/components/map/ride-map";
import { DescribeRidePanel } from "@/components/app/describe-ride-panel";
import { FindDestinationPanel } from "@/components/app/find-destination-panel";
import { RoutePreferenceSettings } from "@/components/app/route-preference-settings";
import {
  RideRequestForm,
  type RideRequestFormProps,
} from "@/components/ride-form/ride-request-form";
import { Button } from "@/components/ui/button";
import { AppTabBar, type AppTab } from "@/components/shell/app-tab-bar";
import { MapBottomPanel } from "@/components/shell/map-bottom-panel";
import { useAppearance } from "@/components/theme/appearance-provider";
import type { Coordinates, Place } from "@/domain/geo/types";
import type { SavedRide } from "@/domain/library/types";
import { savedRideName } from "@/domain/library/types";
import type { NaturalLanguageRideDraft } from "@/domain/ride/parse-natural-language";
import type {
  GenerateRideRequest,
  GeneratedRideRoute,
} from "@/domain/ride/types";
import { isGpxRoute } from "@/domain/gpx/types";
import type { GpxMapOverlay } from "@/domain/gpx/types";
import { plannerRideType } from "@/domain/ride/summarize-request";
import {
  NAVIGATION_ACTIVE_BLOCK_MESSAGE,
  NAVIGATION_ACTIVE_BLOCK_TITLE,
} from "@/domain/navigation/session-copy";
import { ImportGpxPanel } from "@/components/gpx/import-gpx-panel";
import { RouteCatalogPanel } from "@/components/route-catalog/route-catalog-panel";
import { NavigationSession } from "@/components/navigation/navigation-session";
import { TrackRecorderControl } from "@/components/recording/track-recorder-control";
import {
  useTrackRecorder,
  type TrackRecorderDeps,
} from "@/components/recording/use-track-recorder";
import { recordedPointCoordinates } from "@/domain/recording/types";
import { createCarPlayDisplay } from "@/infrastructure/carplay/create-carplay-display";
import {
  findRecentPlaceByCatalogId,
  parseCarPlayCatalogId,
  toCarPlayCatalog,
} from "@/infrastructure/carplay/map-carplay-catalog";
import { createForegroundLocationWatch } from "@/infrastructure/location/create-foreground-location-watch";
import { createLocalRideLibrary } from "@/infrastructure/persistence/local-ride-library";
import { createRideSessionStore } from "@/infrastructure/persistence/ride-session-store";
import { createSpeechGuidance } from "@/infrastructure/voice/speech-guidance";
import type { AppearanceMode } from "@/domain/appearance/appearance";
import {
  readStoredRoutePreferences,
  writeStoredRoutePreferences,
} from "@/domain/ride/stored-route-preferences";
import type { RoutePreferences } from "@/domain/ride/types";
import { formatDistanceLabel, formatDurationLabel } from "@/components/navigation/format-navigation";

type ExplorerSheet =
  | "home"
  | "search"
  | "describe"
  | "planner"
  | "catalog"
  | "gpx";

export type RideAppProps = RideRequestFormProps & {
  /** FR-041 — coutures de test de l'enregistrement de parcours. */
  recording?: Pick<TrackRecorderDeps, "now" | "exportFile">;
};

export function RideApp(props: RideAppProps) {
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
  const [searchSession, setSearchSession] = useState(0);
  const [gpsLabel, setGpsLabel] = useState("Position non demandée");
  const [navUserLocation, setNavUserLocation] = useState<Coordinates | null>(
    null,
  );
  const [navHeadingDeg, setNavHeadingDeg] = useState<number | null>(null);
  const [navProgressKm, setNavProgressKm] = useState(0);
  const [navFollowingUser, setNavFollowingUser] = useState(true);
  /**
   * FR-042 — a request to plan a new ride while one is running is parked here
   * until the rider confirms. Silently tearing down an active session was how
   * navigation appeared to "stop by itself".
   */
  const [pendingRideIntent, setPendingRideIntent] = useState<
    (() => void) | null
  >(null);
  const [gpxOverlay, setGpxOverlay] = useState<GpxMapOverlay | null>(null);
  const [gpxSession, setGpxSession] = useState(0);
  const [describeMuted, setDescribeMuted] = useState(false);
  const [plannerDraft, setPlannerDraft] =
    useState<NaturalLanguageRideDraft | null>(null);
  const [recents, setRecents] = useState<Place[]>([]);
  const [saved, setSaved] = useState<SavedRide[]>([]);
  const [sessionRides, setSessionRides] = useState<SavedRide[]>([]);
  const [formKey, setFormKey] = useState(0);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [useKnowledgeRouting, setUseKnowledgeRouting] = useState(false);
  const requestRef = useRef(request);
  const routeRef = useRef(route);
  const recentsRef = useRef(recents);
  const savedRef = useRef(saved);
  const navigatingRef = useRef(navigating);
  const mapRecenterRef = useRef<() => void>(() => {});
  const mapOverviewRef = useRef<() => void>(() => {});
  const setMapGeolocateEnabledRef = useRef<(enabled: boolean) => void>(
    () => {},
  );
  const ownedLocationWatch = useMemo(() => createForegroundLocationWatch(), []);
  const ownedSpeech = useMemo(() => createSpeechGuidance(), []);
  const locationWatch = props.navigation?.locationWatch ?? ownedLocationWatch;
  const speechEngine = props.navigation?.speech ?? ownedSpeech;
  const carPlay = useMemo(() => createCarPlayDisplay(), []);
  const recorder = useTrackRecorder({
    locationWatch,
    now: props.recording?.now,
    exportFile: props.recording?.exportFile,
  });
  const recorderBusy = recorder.state.status !== "idle";
  const recordingFix =
    recorder.state.status === "recording"
      ? (recorder.state.points[recorder.state.points.length - 1] ?? null)
      : null;
  const plannerOwnsMap = navigating && sheet === "planner";
  const explorerOwnsNavigation =
    navigating &&
    (sheet === "describe" ||
      sheet === "search" ||
      sheet === "catalog" ||
      sheet === "gpx");

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
      setVoiceMuted(restored.muted);
      setUseKnowledgeRouting(restored.useKnowledgeRouting);
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
      muted: voiceMuted,
      useKnowledgeRouting,
      savedAtMs: Date.now(),
    });
  }, [
    navigating,
    request,
    route,
    sessionStore,
    useKnowledgeRouting,
    voiceMuted,
  ]);

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
    navigatingRef.current = false;
    setNavigating(false);
  }

  function rememberGeneratedRoute(
    next: GeneratedRideRoute,
    composed: GenerateRideRequest,
  ) {
    setRoute(next);
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
    if (!navigatingRef.current) {
      queueMicrotask(() => {
        mapOverviewRef.current();
      });
    }
  }

  function discardActiveGpxRide() {
    const gpxId =
      routeRef.current && isGpxRoute(routeRef.current)
        ? routeRef.current.id
        : null;
    const hadGpx =
      requestRef.current?.type === "gpx" || Boolean(gpxId);
    if (!hadGpx) {
      return;
    }
    requestRef.current = null;
    routeRef.current = null;
    setRequest(null);
    setRoute(null);
    setGpxOverlay(null);
    if (gpxId) {
      setSessionRides((current) => current.filter((item) => item.id !== gpxId));
    }
    sessionStore.clear();
  }

  function openFindDestination(place?: Place | null) {
    if (place) {
      setSearchPlace(place);
      setSearchQuery(place.label);
    }
    navigatingRef.current = false;
    setNavigating(false);
    setNavUserLocation(null);
    setNavProgressKm(0);
    setNavFollowingUser(true);
    setNavHeadingDeg(null);
    setSearchSession((value) => value + 1);
    setSheet("search");
    setTab("explore");
  }

  function openGpxImporter() {
    setGpxSession((value) => value + 1);
    setSheet("gpx");
    setTab("explore");
    navigatingRef.current = false;
    setNavigating(false);
    setNavUserLocation(null);
    setNavProgressKm(0);
    setNavFollowingUser(true);
    setNavHeadingDeg(null);
    setGpxOverlay(null);
  }

  function openRouteCatalog() {
    setSheet("catalog");
    setTab("explore");
    navigatingRef.current = false;
    setNavigating(false);
    setNavUserLocation(null);
    setNavProgressKm(0);
    setNavFollowingUser(true);
    setNavHeadingDeg(null);
    setGpxOverlay(null);
  }

  function openRide(nextRequest: GenerateRideRequest, nextRoute: GeneratedRideRoute) {
    if (nextRequest.type === "gpx" || isGpxRoute(nextRoute)) {
      requestRef.current = nextRequest;
      routeRef.current = nextRoute;
      setRequest(nextRequest);
      setRoute(nextRoute);
      openGpxImporter();
      return;
    }
    openPlanner({
      type: plannerRideType(nextRequest.type),
      seed: { request: nextRequest, route: nextRoute },
    });
  }

  function startGuidedNavigation(options?: { muted?: boolean }) {
    if (navigatingRef.current) {
      return;
    }
    navigatingRef.current = true;
    try {
      setMapGeolocateEnabledRef.current(false);
    } catch {
      // Preview GPS teardown must not block the explicit start (FR-023).
    }
    try {
      locationWatch.start();
    } catch {
      // The overlay must still open after the explicit action (FR-023).
    }
    try {
      speechEngine.unlock();
    } catch {
      // Visual navigation continues if speech cannot unlock (FR-025).
    }
    try {
      mapRecenterRef.current();
    } catch {
      // Follow-user camera still starts with the overlay (FR-023).
    }
    setDescribeMuted(Boolean(options?.muted));
    setNavProgressKm(0);
    setNavFollowingUser(true);
    setNavigating(true);
  }

  function stopGuidedNavigation() {
    navigatingRef.current = false;
    setNavigating(false);
    setNavUserLocation(null);
    setNavHeadingDeg(null);
    setNavProgressKm(0);
    setNavFollowingUser(true);
    setGpxOverlay(null);
    if (routeRef.current && isGpxRoute(routeRef.current)) {
      discardActiveGpxRide();
      setSheet("home");
    }
  }

  /**
   * Run `intent` now, or ask first when a navigation session is live.
   * Returns true when the action was carried out immediately.
   */
  function withNavigationGuard(intent: () => void): boolean {
    if (!navigatingRef.current) {
      intent();
      return true;
    }
    setPendingRideIntent(() => intent);
    return false;
  }

  function confirmPendingRideIntent() {
    const intent = pendingRideIntent;
    setPendingRideIntent(null);
    if (!intent) {
      return;
    }
    stopGuidedNavigation();
    intent();
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
          openRide(currentRequest, currentRoute);
        }
        return;
      }
      if (parsed.type === "recent") {
        const place = findRecentPlaceByCatalogId(
          recentsRef.current,
          event.id,
        );
        if (place) {
          withNavigationGuard(() => openFindDestination(place));
        }
        return;
      }
      const item = savedRef.current.find((ride) => ride.id === parsed.id);
      if (item) {
        withNavigationGuard(() => openRide(item.request, item.route));
      }
    });
    /* Catalog handlers close over the latest openRide; resubscribing on each
     * render would drop CarPlay events (FR-028). */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribe once per display
  }, [carPlay]);

  const planner = (
    <RideRequestForm
      key={formKey}
      {...props}
      chrome="plain"
      hideMap={!navigating}
      initialType={plannerType}
      initialDestination={searchPlace}
      initialDraft={plannerDraft}
      seed={seed}
      initialMuted={voiceMuted}
      initialUseKnowledgeRouting={useKnowledgeRouting}
      onVoiceMutedChange={setVoiceMuted}
      onKnowledgeRoutingChange={setUseKnowledgeRouting}
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
        const composed = requestRef.current;
        if (next && composed) {
          rememberGeneratedRoute(next, composed);
          return;
        }
        setRoute(next);
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
        {tab === "explore" && !plannerOwnsMap ? (
          <div className="absolute inset-0">
            <RideMap
              route={route}
              overlay={gpxOverlay}
              engine={props.mapEngine}
              fill
              expanded={explorerOwnsNavigation}
              recordedTrack={recorder.overlay}
              recordingActive={recorderBusy}
              userLocation={
                explorerOwnsNavigation
                  ? navUserLocation
                  : recordingFix
                    ? recordedPointCoordinates(recordingFix)
                    : null
              }
              headingDeg={
                explorerOwnsNavigation
                  ? navHeadingDeg
                  : typeof recordingFix?.heading === "number" &&
                      Number.isFinite(recordingFix.heading)
                    ? recordingFix.heading
                    : null
              }
              traveledKm={explorerOwnsNavigation ? navProgressKm : 0}
              onFollowUserChange={setNavFollowingUser}
              onRecenterReady={(recenter) => {
                mapRecenterRef.current = recenter;
              }}
              onOverviewReady={(overview) => {
                mapOverviewRef.current = overview;
              }}
              onGeolocateReady={(setEnabled) => {
                setMapGeolocateEnabledRef.current = setEnabled;
              }}
            />
          </div>
        ) : null}

        {explorerOwnsNavigation && route && request ? (
          <NavigationSession
            route={route}
            request={request}
            renderMap={false}
            onUserLocation={(point, heading) => {
              setNavUserLocation(point);
              setNavHeadingDeg(
                typeof heading === "number" && Number.isFinite(heading)
                  ? heading
                  : null,
              );
            }}
            onRecenter={() => mapRecenterRef.current()}
            onOverview={() => mapOverviewRef.current()}
            onStop={stopGuidedNavigation}
            onProgressKm={setNavProgressKm}
            followingUser={navFollowingUser}
            onGpxOverlayChange={setGpxOverlay}
            onRouteChange={(next) => {
              const composed = requestRef.current;
              if (composed) {
                rememberGeneratedRoute(next, composed);
                return;
              }
              setRoute(next);
            }}
            locationWatch={locationWatch}
            speech={speechEngine}
            recalculate={props.navigation?.recalculate}
            joinRoute={props.navigation?.joinRoute}
            now={props.navigation?.now}
            initialMuted={describeMuted}
          />
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

        {tab === "explore" && sheet !== "planner" ? (
          <div
            className={
              navigating
                ? "hidden"
                : "pointer-events-none absolute inset-x-0 bottom-0 z-10"
            }
          >
            {sheet === "home" ? (
              <MapBottomPanel title="Explorer" titleHidden>
                <div className="grid gap-2">
                  <Button
                    type="button"
                    size="lg"
                    className="min-h-12 w-full text-base"
                    onClick={() => openFindDestination()}
                  >
                    Rechercher une destination
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
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="min-h-12 w-full text-base"
                    onClick={() => openRouteCatalog()}
                  >
                    Découvrir des trajets moto
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="min-h-12 w-full text-base"
                    onClick={() => openGpxImporter()}
                  >
                    Importer un fichier GPX
                  </Button>
                  {route && request ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="lg"
                      className="min-h-12 w-full text-base"
                      onClick={() =>
                        request && route
                          ? openRide(request, route)
                          : undefined
                      }
                    >
                      Reprendre la navigation
                    </Button>
                  ) : null}
                </div>
                {saved.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    <h2 className="text-sm font-medium">Trajets favoris</h2>
                    {saved.slice(0, 3).map((item) => (
                      <Button
                        key={item.id}
                        type="button"
                        variant="ghost"
                        className="min-h-12 w-full justify-start text-base"
                        onClick={() => openRide(item.request, item.route)}
                      >
                        {item.name}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </MapBottomPanel>
            ) : null}

            {sheet === "search" ? (
              <MapBottomPanel
                title="Trouver une destination"
                className={route ? "max-h-[58dvh]" : undefined}
              >
                <FindDestinationPanel
                  key={searchSession}
                  generateRide={props.generateRide}
                  regenerateRide={props.regenerateRide}
                  searchPlaces={props.searchPlaces}
                  debounceMs={props.debounceMs}
                  mapEngine={props.mapEngine}
                  initialDestination={searchPlace}
                  initialQuery={searchQuery}
                  navigationActive={navigating && sheet === "search"}
                  requestPosition={
                    props.requestPosition ??
                    (props.requestCoordinates
                      ? async () => ({
                          coordinates: await props.requestCoordinates!(),
                          accuracyMeters: null,
                        })
                      : undefined)
                  }
                  reversePlace={props.reversePlace}
                  onDestinationChange={(place, query) => {
                    setSearchPlace(place);
                    setSearchQuery(query);
                    if (place) {
                      remember(place);
                    }
                  }}
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
                    const composed = requestRef.current;
                    if (composed) {
                      rememberGeneratedRoute(next, composed);
                    }
                  }}
                  onStartNavigation={startGuidedNavigation}
                  onBack={() => setSheet("home")}
                />
              </MapBottomPanel>
            ) : null}

            {sheet === "describe" ? (
              <MapBottomPanel
                title="Décrire mon trajet"
                className={route ? "max-h-[58dvh]" : undefined}
              >
                <DescribeRidePanel
                  generateRide={props.generateRide}
                  regenerateRide={props.regenerateRide}
                  requestPosition={
                    props.requestPosition ??
                    (props.requestCoordinates
                      ? async () => ({
                          coordinates: await props.requestCoordinates!(),
                          accuracyMeters: null,
                        })
                      : undefined)
                  }
                  onRequestComposed={(composed) => {
                    requestRef.current = composed;
                    setRequest(composed);
                    props.onRequestComposed?.(composed);
                  }}
                  onGeneratedRouteChange={(next) => {
                    const composed = requestRef.current;
                    if (composed) {
                      rememberGeneratedRoute(next, composed);
                    }
                  }}
                  onStartNavigation={startGuidedNavigation}
                  onBack={() => setSheet("home")}
                />
              </MapBottomPanel>
            ) : null}

            {sheet === "gpx" ? (
              <MapBottomPanel
                title="Importer un fichier GPX"
                className={route ? "max-h-[58dvh]" : undefined}
              >
                <ImportGpxPanel
                  key={gpxSession}
                  initialRoute={route && isGpxRoute(route) ? route : null}
                  onPreview={(next, composed) => {
                    if (!next || !composed) {
                      discardActiveGpxRide();
                      return;
                    }
                    requestRef.current = composed;
                    setRequest(composed);
                    rememberGeneratedRoute(next, composed);
                    props.onRequestComposed?.(composed);
                  }}
                  onStartNavigation={startGuidedNavigation}
                  onBack={() => setSheet("home")}
                  navigationActive={navigating && sheet === "gpx"}
                />
              </MapBottomPanel>
            ) : null}

            {sheet === "catalog" ? (
              <MapBottomPanel
                title="Découvrir des trajets moto"
                className={route ? "max-h-[68dvh]" : "max-h-[76dvh]"}
              >
                <RouteCatalogPanel
                  onPreview={(next, composed) => {
                    requestRef.current = composed;
                    setRequest(composed);
                    rememberGeneratedRoute(next, composed);
                    props.onRequestComposed?.(composed);
                  }}
                  onStartNavigation={startGuidedNavigation}
                  onBack={() => setSheet("home")}
                  navigationActive={navigating && sheet === "catalog"}
                />
              </MapBottomPanel>
            ) : null}
          </div>
        ) : null}

        {tab === "rides" && !navigating ? (
          <LibraryList
            title="Mes trajets"
            empty="Aucun trajet généré dans cette session."
            items={sessionRides}
            onStart={(item) => openRide(item.request, item.route)}
          />
        ) : null}

        {tab === "saved" && !navigating ? (
          <LibraryList
            title="Enregistrés"
            empty="Aucun trajet enregistré sur cet appareil."
            items={saved}
            onStart={(item) => openRide(item.request, item.route)}
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
      {tab === "explore" || recorderBusy ? (
        <div
          className={
            navigating
              ? "relative z-30 border-t border-border bg-card/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md"
              : "relative z-30 border-t border-border bg-card/95 px-3 py-2 backdrop-blur-md"
          }
        >
          <TrackRecorderControl recorder={recorder} now={props.recording?.now} />
        </div>
      ) : null}
      {pendingRideIntent ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label={NAVIGATION_ACTIVE_BLOCK_TITLE}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-card p-4 text-card-foreground shadow-xl">
            <h2 className="text-lg font-semibold">
              {NAVIGATION_ACTIVE_BLOCK_TITLE}
            </h2>
            <p className="text-base leading-6">
              {NAVIGATION_ACTIVE_BLOCK_MESSAGE}
            </p>
            <div className="grid gap-2">
              <Button
                type="button"
                size="lg"
                className="min-h-12 w-full text-base"
                onClick={confirmPendingRideIntent}
              >
                Terminer et continuer
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="min-h-12 w-full text-base"
                onClick={() => setPendingRideIntent(null)}
              >
                Poursuivre la navigation
              </Button>
            </div>
          </div>
        </div>
      ) : null}
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
  const [routePreferences, setRoutePreferences] = useState<RoutePreferences>(
    () =>
      readStoredRoutePreferences(
        typeof window === "undefined" ? null : window.localStorage,
      ),
  );

  function persistRoutePreferences(next: RoutePreferences) {
    setRoutePreferences(next);
    writeStoredRoutePreferences(
      typeof window === "undefined" ? null : window.localStorage,
      next,
    );
  }

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
      <div className="mt-6">
        <RoutePreferenceSettings
          value={routePreferences}
          onChange={persistRoutePreferences}
        />
      </div>
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
