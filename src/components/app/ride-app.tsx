"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RideMap } from "@/components/map/ride-map";
import { DEFAULT_EXPLORER_CENTER } from "@/components/map/ride-map-view-model";
import { toWeatherMapOverlay } from "@/components/map/weather-overlay";
import { WeatherMapControl } from "@/components/weather/weather-map-control";
import { useWeatherWatch } from "@/components/weather/use-weather-watch";
import { DescribeRidePanel } from "@/components/app/describe-ride-panel";
import { FindDestinationPanel } from "@/components/app/find-destination-panel";
import {
  RoutePreferenceSettings,
  RouteStyleSettings,
} from "@/components/app/route-preference-settings";
import {
  RideRequestForm,
  type RideRequestFormProps,
} from "@/components/ride-form/ride-request-form";
import { Button } from "@/components/ui/button";
import { AppTabBar, type AppTab } from "@/components/shell/app-tab-bar";
import { MapBottomPanel } from "@/components/shell/map-bottom-panel";
import { MapQuickActions } from "@/components/shell/map-quick-actions";
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
import {
  createSpeechGuidance,
  type SpeechGuidance,
} from "@/infrastructure/voice/speech-guidance";
import { VoiceSettings } from "@/components/app/voice-settings";
import {
  readStoredVoicePreferences,
  writeStoredVoicePreferences,
  type VoicePreferences,
} from "@/domain/navigation/voice-preferences";
import { createNavigationAudioCues } from "@/infrastructure/audio/navigation-audio-cues";
import type { AppearanceMode } from "@/domain/appearance/appearance";
import {
  readStoredRoutePreferences,
  readStoredRouteStyle,
  writeStoredRoutePreferences,
  writeStoredRouteStyle,
  type StoredRouteStyle,
} from "@/domain/ride/stored-route-preferences";
import type { RoutePreferences } from "@/domain/ride/types";
import { formatDistanceLabel, formatDurationLabel } from "@/components/navigation/format-navigation";
import { cn } from "@/lib/utils";

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
  const [catalogCollapsed, setCatalogCollapsed] = useState(false);
  const [describeMuted, setDescribeMuted] = useState(false);
  const [plannerDraft, setPlannerDraft] =
    useState<NaturalLanguageRideDraft | null>(null);
  const [recents, setRecents] = useState<Place[]>([]);
  const [saved, setSaved] = useState<SavedRide[]>([]);
  const [sessionRides, setSessionRides] = useState<SavedRide[]>([]);
  const [formKey, setFormKey] = useState(0);
  const [voiceMuted, setVoiceMuted] = useState(false);
  /** FR-043 — the weather layer is off until the rider asks for it. */
  const [weatherActive, setWeatherActive] = useState(false);
  const [radarFrameId, setRadarFrameId] = useState<string | null>(null);
  const [useKnowledgeRouting, setUseKnowledgeRouting] = useState(false);
  const requestRef = useRef(request);
  const routeRef = useRef(route);
  const recentsRef = useRef(recents);
  const savedRef = useRef(saved);
  const navigatingRef = useRef(navigating);
  const mapRecenterRef = useRef<() => void>(() => {});
  // FR-038 — published by FindDestinationPanel, called by the explorer map.
  const findDestinationPickRef = useRef<
    ((coordinates: Coordinates) => void) | null
  >(null);
  const mapOverviewRef = useRef<() => void>(() => {});
  const setMapGeolocateEnabledRef = useRef<(enabled: boolean) => void>(
    () => {},
  );
  const ownedLocationWatch = useMemo(() => createForegroundLocationWatch(), []);
  const ownedSpeech = useMemo(() => createSpeechGuidance(), []);
  const ownedAudioCues = useMemo(() => createNavigationAudioCues(), []);
  const locationWatch = props.navigation?.locationWatch ?? ownedLocationWatch;
  const speechEngine = props.navigation?.speech ?? ownedSpeech;
  const audioCues = props.navigation?.audioCues ?? ownedAudioCues;
  const carPlay = useMemo(() => createCarPlayDisplay(), []);
  const recorder = useTrackRecorder({
    locationWatch,
    now: props.recording?.now,
    exportFile: props.recording?.exportFile,
  });
  const recorderBusy = recorder.state.status !== "idle";
  const recorderNeedsReview =
    recorder.state.status !== "idle" &&
    recorder.state.status !== "recording" &&
    recorder.state.status !== "requesting-permission";
  const recordingFix =
    recorder.state.status === "recording"
      ? (recorder.state.points[recorder.state.points.length - 1] ?? null)
      : null;
  /**
   * FR-043 — the sky is read where the rider is: the live fix while riding or
   * recording, the start of the planned ride otherwise.
   */
  const weatherCenter = useMemo<Coordinates>(() => {
    if (navUserLocation) {
      return navUserLocation;
    }
    if (recordingFix) {
      return recordedPointCoordinates(recordingFix);
    }
    if (route) {
      return route.start.coordinates;
    }
    return DEFAULT_EXPLORER_CENTER;
  }, [navUserLocation, recordingFix, route]);
  const weather = useWeatherWatch({
    enabled: weatherActive,
    center: weatherCenter,
  });
  const weatherOverlay = useMemo(
    () => toWeatherMapOverlay(weather.report, { frameId: radarFrameId }),
    [radarFrameId, weather.report],
  );
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
    setCatalogCollapsed(false);
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
      audioCues.unlock();
    } catch {
      // Navigation continues without earcons (FR-044).
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
          <>
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
                weather={weatherOverlay}
                /*
                 * FR-038 — the destination pane floats over this map, so the
                 * map itself is what the rider picks a point on: no button,
                 * no second full-screen map.
                 */
                pickMode={sheet === "search" && !navigating}
                /*
                 * A generated route already draws its own destination marker,
                 * so the draggable pin only stands in while there is none.
                 */
                pickMarker={
                  sheet === "search" && !route
                    ? (searchPlace?.coordinates ?? null)
                    : null
                }
                onPick={(coordinates) =>
                  findDestinationPickRef.current?.(coordinates)
                }
              />
            </div>
            <div className="pointer-events-none absolute top-[max(0.75rem,env(safe-area-inset-top))] left-3 z-20 flex w-[min(22rem,calc(100%-1.5rem))]">
              <WeatherMapControl
                active={weatherActive}
                onToggle={(next) => {
                  setWeatherActive(next);
                  if (!next) {
                    setRadarFrameId(null);
                  }
                }}
                status={weather.status}
                report={weather.report}
                advice={weather.advice}
                error={weather.error}
                frameId={radarFrameId}
                onFrameChange={setRadarFrameId}
                className="w-full"
              />
            </div>
          </>
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
            audioCues={audioCues}
            recalculate={props.navigation?.recalculate}
            joinRoute={props.navigation?.joinRoute}
            now={props.navigation?.now}
            initialMuted={describeMuted}
          />
        ) : null}

        {tab === "explore" && sheet === "home" && !navigating ? (
          <div
            data-testid="map-home-controls"
            className="pointer-events-none absolute inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 flex flex-col items-center gap-3 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]"
          >
            {recorderNeedsReview ? null : (
              <MapQuickActions
                onSearch={() => openFindDestination()}
                onDescribe={() => setSheet("describe")}
                onCatalog={openRouteCatalog}
                onImportGpx={openGpxImporter}
                onResume={
                  route && request ? () => openRide(request, route) : undefined
                }
              />
            )}
            <TrackRecorderControl
              recorder={recorder}
              now={props.recording?.now}
            />
          </div>
        ) : null}

        {recorderBusy && (sheet !== "home" || tab !== "explore" || navigating) ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 flex justify-center px-3">
            <TrackRecorderControl
              recorder={recorder}
              now={props.recording?.now}
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
                  : "ride-map-panel ride-glass-strong pointer-events-auto max-h-[85dvh] overflow-y-auto rounded-t-[2rem] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
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
            {sheet === "search" ? (
              <MapBottomPanel
                title="Trouver une destination"
                titleHidden
                variant="floating"
                className={route ? "max-h-[58dvh]" : undefined}
              >
                <FindDestinationPanel
                  key={searchSession}
                  generateRide={props.generateRide}
                  regenerateRide={props.regenerateRide}
                  searchPlaces={props.searchPlaces}
                  debounceMs={props.debounceMs}
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
                  onMapPickReady={(pick) => {
                    findDestinationPickRef.current = pick;
                  }}
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
                titleHidden
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
                titleHidden={catalogCollapsed}
                variant="floating"
                className={route ? "max-h-[72dvh]" : "max-h-[82dvh]"}
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
                  onCollapsedChange={setCatalogCollapsed}
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
            speech={speechEngine}
          />
        ) : null}
      </div>
      {pendingRideIntent ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label={NAVIGATION_ACTIVE_BLOCK_TITLE}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <div className="ride-map-panel ride-glass-strong w-full max-w-md space-y-3 rounded-3xl p-4">
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
    <div className="ride-page absolute inset-0 z-10 overflow-y-auto">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {items.length === 0 ? (
        <p className="mt-4 text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-2xl border border-border bg-card/82 px-3 py-3 shadow-sm"
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
  speech,
}: {
  mode: AppearanceMode;
  onMode: (mode: AppearanceMode) => void;
  gpsLabel: string;
  onGpsLabel: (label: string) => void;
  speech: SpeechGuidance;
}) {
  const [routePreferences, setRoutePreferences] = useState<RoutePreferences>(
    () =>
      readStoredRoutePreferences(
        typeof window === "undefined" ? null : window.sessionStorage,
      ),
  );
  const [routeStyle, setRouteStyle] = useState<StoredRouteStyle>(() =>
    readStoredRouteStyle(
      typeof window === "undefined" ? null : window.sessionStorage,
    ),
  );
  /**
   * FR-025 — le choix de voix survit à la fermeture de l'application, contrairement
   * aux préférences de route. Ce panneau n'est monté qu'après un clic d'onglet, donc
   * lire `localStorage` dans l'initialiseur ne peut pas créer d'écart d'hydratation.
   */
  const [voicePreferences, setVoicePreferences] = useState<VoicePreferences>(() =>
    readStoredVoicePreferences(
      typeof window === "undefined" ? null : window.localStorage,
    ),
  );

  function persistRoutePreferences(next: RoutePreferences) {
    setRoutePreferences(next);
    writeStoredRoutePreferences(
      typeof window === "undefined" ? null : window.sessionStorage,
      next,
    );
  }

  function persistRouteStyle(next: StoredRouteStyle) {
    setRouteStyle(next);
    writeStoredRouteStyle(
      typeof window === "undefined" ? null : window.sessionStorage,
      next,
    );
  }

  function persistVoicePreferences(next: VoicePreferences) {
    setVoicePreferences(next);
    try {
      writeStoredVoicePreferences(
        typeof window === "undefined" ? null : window.localStorage,
        next,
      );
    } catch {
      // Private mode.
    }
  }

  return (
    <div className="ride-page absolute inset-0 z-10 overflow-y-auto">
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
            className={cn(
              "ride-control-row flex w-full items-center text-left text-base",
              mode === value && "border-primary bg-primary text-primary-foreground",
            )}
            onClick={() => onMode(value)}
          >
            {label}
          </button>
        ))}
      </fieldset>
      <div className="mt-6">
        <RouteStyleSettings
          value={routeStyle}
          onChange={persistRouteStyle}
        />
      </div>
      <div className="mt-6">
        <RoutePreferenceSettings
          value={routePreferences}
          onChange={persistRoutePreferences}
        />
      </div>
      <div className="mt-6">
        <VoiceSettings
          value={voicePreferences}
          onChange={persistVoicePreferences}
          speech={speech}
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
