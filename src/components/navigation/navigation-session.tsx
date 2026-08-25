"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LocationWatch } from "@/domain/location/types";
import {
  evaluateNavigationProgress,
  navigationDisplayHeading,
  navigationDisplayLocation,
} from "@/domain/navigation/progress";
import {
  emptyOffRouteTracker,
  evaluateOffRoute,
  markRecalculateAborted,
  markRecalculateStarted,
} from "@/domain/navigation/off-route";
import { decideAnnouncement, emptyVoiceMemory, resetVoiceMemory } from "@/domain/navigation/voice";
import { formatFrenchInstruction, roadLabel } from "@/domain/navigation/instructions";
import type { Coordinates } from "@/domain/geo/types";
import type { LocationFix, NavigationProgress } from "@/domain/navigation/types";
import type { GenerateRideRequest, GeneratedRideRoute, RideGenerationError } from "@/domain/ride/types";
import type { CarPlayDisplay } from "@/infrastructure/carplay/carplay-display";
import { createCarPlayDisplay } from "@/infrastructure/carplay/create-carplay-display";
import { toCarPlaySessionSnapshot } from "@/infrastructure/carplay/map-carplay-snapshot";
import {
  createForegroundScreenWakeLock,
  type ScreenWakeLock,
} from "@/infrastructure/device/screen-wake-lock";
import { createForegroundLocationWatch } from "@/infrastructure/location/create-foreground-location-watch";
import { createSpeechGuidance, type SpeechGuidance } from "@/infrastructure/voice/speech-guidance";
import { NavigationMap, type NavigationMapProps } from "./navigation-map";
import { NavigationOverlay } from "./navigation-overlay";
import { maneuverArrow } from "./maneuver-arrow";
import {
  requestRecalculatedRide,
  type RecalculateRideInput,
} from "./request-recalculated-ride";
import {
  requestJoinRoute,
  type JoinRouteClientInput,
} from "./request-join-route";
import type { GpxMapOverlay } from "@/domain/gpx/types";
import { isGpxRoute } from "@/domain/gpx/types";
import {
  GPX_JOIN_CALCULATING_MESSAGE,
  JOINING_GPX_MESSAGE,
} from "@/domain/gpx/copy";
import {
  GPX_OFF_ROUTE_ACCURACY_MULTIPLIER,
  GPX_OFF_ROUTE_CONSECUTIVE_FIXES,
  GPX_OFF_ROUTE_MIN_DURATION_MS,
  GPX_OFF_ROUTE_MIN_THRESHOLD_M,
  GPX_REJOIN_COOLDOWN_MS,
} from "@/domain/gpx/constants";
import { selectGpxRejoinPoint } from "@/domain/gpx/follow";
import {
  attachGpxConnector,
  beginGpxFromFix,
  combinedRemainingKm,
  connectorFromProvider,
  enterFollowingIfOnTrace,
  followProgressComplete,
  gpxMapOverlay,
  gpxStatusLabel,
  liveRuntimeFromOriginal,
  markGpxCompleted,
  type LiveGpxRuntime,
} from "@/domain/gpx/navigation";
import type { ProviderRouteResult } from "@/infrastructure/routing/routing-provider";

export type NavigationSessionProps = {
  route: GeneratedRideRoute;
  request: GenerateRideRequest;
  onStop: () => void;
  onRouteChange?: (route: GeneratedRideRoute) => void;
  locationWatch?: LocationWatch;
  speech?: SpeechGuidance;
  carPlay?: CarPlayDisplay;
  recalculate?: (
    input: RecalculateRideInput,
    signal?: AbortSignal,
  ) => ReturnType<typeof requestRecalculatedRide>;
  joinRoute?: (
    input: JoinRouteClientInput,
    signal?: AbortSignal,
  ) => Promise<
    { ok: true; route: ProviderRouteResult } | { ok: false; error: RideGenerationError }
  >;
  now?: () => number;
  mapEngine?: NavigationMapProps["engine"];
  renderMap?: boolean;
  /** FR-029 — keep the knowledge adapter on FR-026 recalculation. */
  useKnowledgeRouting?: boolean;
  initialMuted?: boolean;
  onMutedChange?: (muted: boolean) => void;
  onUserLocation?: (
    point: Coordinates | null,
    headingDeg?: number | null,
  ) => void;
  onRecenter?: () => void;
  onOverview?: () => void;
  onGpxOverlayChange?: (overlay: GpxMapOverlay | null) => void;
  wakeLock?: ScreenWakeLock;
};

export function NavigationSession({
  route,
  request,
  onStop,
  onRouteChange,
  locationWatch,
  speech,
  carPlay,
  recalculate = requestRecalculatedRide,
  joinRoute = requestJoinRoute,
  now = Date.now,
  mapEngine,
  renderMap = true,
  useKnowledgeRouting = false,
  onUserLocation,
  onRecenter,
  onOverview,
  onGpxOverlayChange,
  wakeLock,
  initialMuted = false,
  onMutedChange,
}: NavigationSessionProps) {
  const [currentRoute, setCurrentRoute] = useState(route);
  const [muted, setMuted] = useState(initialMuted);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [progressKm, setProgressKm] = useState(0);
  const [instruction, setInstruction] = useState("Recherche de la position…");
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [gpxOverlay, setGpxOverlay] = useState<GpxMapOverlay | null>(() =>
    isGpxRoute(route) ? gpxMapOverlay(liveRuntimeFromOriginal(route)) : null,
  );
  const [arrow, setArrow] = useState("↑");
  const [nextRoad, setNextRoad] = useState<string | undefined>();
  const [distanceToManeuverKm, setDistanceToManeuverKm] = useState(0);
  const [remainingDistanceKm, setRemainingDistanceKm] = useState(route.distanceKm);
  const [remainingMinutes, setRemainingMinutes] = useState(route.durationMinutes);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [recalcError, setRecalcError] = useState<RideGenerationError | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [carPlayConnected, setCarPlayConnected] = useState(false);
  const recenterRef = useRef<() => void>(() => {});
  const onUserLocationRef = useRef(onUserLocation);
  const onRecenterRef = useRef(onRecenter);
  const onOverviewPropRef = useRef(onOverview);
  const onGpxOverlayChangeRef = useRef(onGpxOverlayChange);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [headingDeg, setHeadingDeg] = useState<number | null>(null);

  const progressRef = useRef<number | null>(null);
  const offRouteRef = useRef(emptyOffRouteTracker());
  const voiceRef = useRef(emptyVoiceMemory());
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const routeRef = useRef(currentRoute);
  const mutedRef = useRef(muted);
  const recalculatingRef = useRef(false);
  const hiddenRef = useRef(false);
  const carPlayConnectedRef = useRef(false);
  const ownsVoiceRef = useRef(false);
  const voiceHandedToCarPlayRef = useRef(false);
  const headingRef = useRef<number | null>(null);
  const userLocationRef = useRef<Coordinates | null>(null);
  const progressSnapshotRef = useRef<NavigationProgress | null>(null);
  const remainingDistanceRef = useRef(route.distanceKm);
  const remainingMinutesRef = useRef(route.durationMinutes);
  const stoppedRef = useRef(false);
  const gpxRuntimeRef = useRef<LiveGpxRuntime | null>(
    isGpxRoute(route) ? liveRuntimeFromOriginal(route) : null,
  );
  const joinRouteRef = useRef(joinRoute);
  const requestRef = useRef(request);
  const runRecalculateRef = useRef<
    (
      currentPosition: { latitude: number; longitude: number },
      currentProgressKm: number,
    ) => Promise<void>
  >(async () => {});
  const fetchGpxJoinRef = useRef<
    (from: Coordinates, to: Coordinates) => Promise<void>
  >(async () => {});

  const speechEngine = useMemo(
    () => speech ?? createSpeechGuidance(),
    [speech],
  );
  const screenWakeLock = useMemo(
    () => wakeLock ?? createForegroundScreenWakeLock(),
    [wakeLock],
  );
  const carPlayDisplay = useMemo(
    () => carPlay ?? createCarPlayDisplay(),
    [carPlay],
  );

  useEffect(() => {
    routeRef.current = currentRoute;
  }, [currentRoute]);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  useEffect(() => {
    joinRouteRef.current = joinRoute;
  }, [joinRoute]);
  useEffect(() => {
    requestRef.current = request;
  }, [request]);

  useEffect(() => {
    onMutedChange?.(muted);
  }, [muted, onMutedChange]);
  useEffect(() => {
    recalculatingRef.current = recalculating;
  }, [recalculating]);
  useEffect(() => {
    hiddenRef.current = hidden;
  }, [hidden]);
  useEffect(() => {
    carPlayConnectedRef.current = carPlayConnected;
  }, [carPlayConnected]);
  useEffect(() => {
    onUserLocationRef.current = onUserLocation;
  }, [onUserLocation]);
  useEffect(() => {
    onRecenterRef.current = onRecenter;
  }, [onRecenter]);
  useEffect(() => {
    onOverviewPropRef.current = onOverview;
  }, [onOverview]);
  useEffect(() => {
    onGpxOverlayChangeRef.current = onGpxOverlayChange;
  }, [onGpxOverlayChange]);

  useEffect(() => {
    if (!isGpxRoute(route)) {
      return;
    }
    onGpxOverlayChangeRef.current?.(
      gpxMapOverlay(gpxRuntimeRef.current ?? liveRuntimeFromOriginal(route)),
    );
    return () => {
      if (!stoppedRef.current) {
        onGpxOverlayChangeRef.current?.(null);
      }
    };
  }, [route]);

  useEffect(() => {
    speechEngine.setMuted(muted);
  }, [muted, speechEngine]);

  useEffect(() => {
    if (hidden) {
      screenWakeLock.release();
      return;
    }
    screenWakeLock.acquire();
    return () => {
      screenWakeLock.release();
    };
  }, [hidden, screenWakeLock]);

  const publishGpxOverlay = useCallback((runtime: LiveGpxRuntime | null) => {
    const overlay = gpxMapOverlay(runtime);
    setGpxOverlay(overlay);
    onGpxOverlayChangeRef.current?.(overlay);
  }, []);

  const pushCarPlay = useCallback(
    (speakText: string | null, options?: { cancelSpeech?: boolean }) => {
      if (stoppedRef.current) {
        return;
      }
      const geometry =
        gpxRuntimeRef.current?.phase === "joining_gpx" &&
        gpxRuntimeRef.current.connector
          ? gpxRuntimeRef.current.connector.geometry
          : gpxRuntimeRef.current?.phase === "following_gpx"
            ? gpxRuntimeRef.current.followRoute.geometry
            : routeRef.current.geometry;
      void carPlayDisplay.update(
        toCarPlaySessionSnapshot({
          routeId: routeRef.current.id,
          geometry,
          progress: progressSnapshotRef.current,
          userLocation: userLocationRef.current,
          headingDeg: headingRef.current,
          muted: mutedRef.current,
          speakText,
          cancelSpeech: options?.cancelSpeech,
          remainingDistanceKm: remainingDistanceRef.current,
          remainingDurationMinutes: remainingMinutesRef.current,
        }),
      );
    },
    [carPlayDisplay],
  );

  const handleStop = useCallback(() => {
    if (stoppedRef.current) {
      return;
    }
    stoppedRef.current = true;
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    voiceRef.current = resetVoiceMemory();
    progressSnapshotRef.current = null;
    gpxRuntimeRef.current = null;
    publishGpxOverlay(null);
    speechEngine.cancel();
    void carPlayDisplay.stop();
    onStop();
  }, [carPlayDisplay, onStop, publishGpxOverlay, speechEngine]);
  const handleStopRef = useRef(handleStop);
  useEffect(() => {
    handleStopRef.current = handleStop;
  }, [handleStop]);

  const handOffVoiceToCarPlay = useCallback(() => {
    speechEngine.cancel();
    if (voiceHandedToCarPlayRef.current) {
      return;
    }
    voiceHandedToCarPlayRef.current = true;
    voiceRef.current = resetVoiceMemory();
    const progress = progressSnapshotRef.current;
    if (!progress) {
      return;
    }
    const announcement = decideAnnouncement({
      step: progress.nextStep,
      distanceToManeuverM: progress.distanceToNextManeuverM,
      muted: mutedRef.current,
      memory: voiceRef.current,
    });
    voiceRef.current = announcement.memory;
    pushCarPlay(announcement.speak ?? null);
  }, [pushCarPlay, speechEngine]);

  const runRecalculate = useCallback(async (
    currentPosition: { latitude: number; longitude: number },
    currentProgressKm: number,
  ) => {
    if (gpxRuntimeRef.current) {
      return;
    }
    if (
      recalculatingRef.current ||
      (hiddenRef.current && !carPlayConnectedRef.current)
    ) {
      return;
    }
    generationRef.current += 1;
    const generation = generationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRecalculating(true);
    recalculatingRef.current = true;
    offRouteRef.current = markRecalculateStarted(offRouteRef.current, now());
    speechEngine.cancel();
    voiceRef.current = resetVoiceMemory();
    pushCarPlay(null, { cancelSpeech: true });

    const result = await recalculate(
      {
        currentPosition,
        progressKm: currentProgressKm,
        request,
        originalRoute: routeRef.current,
        useKnowledgeRouting,
      },
      controller.signal,
    );

    if (generation !== generationRef.current || controller.signal.aborted) {
      offRouteRef.current = markRecalculateAborted(offRouteRef.current);
      setRecalculating(false);
      recalculatingRef.current = false;
      return;
    }

    setRecalculating(false);
    recalculatingRef.current = false;
    if (!result.ok) {
      if (result.error.code !== "STALE_RECALCULATE") {
        setRecalcError(result.error);
      }
      return;
    }

    setRecalcError(null);
    setCurrentRoute(result.route);
    routeRef.current = result.route;
    progressRef.current = 0;
    progressSnapshotRef.current = null;
    remainingDistanceRef.current = result.route.distanceKm;
    remainingMinutesRef.current = result.route.durationMinutes;
    onRouteChange?.(result.route);
    pushCarPlay(null);
  }, [now, onRouteChange, pushCarPlay, recalculate, request, speechEngine, useKnowledgeRouting]);

  const fetchGpxJoin = useCallback(async (
    from: Coordinates,
    to: Coordinates,
  ) => {
    const runtime = gpxRuntimeRef.current;
    if (!runtime || runtime.phase === "gpx_completed") {
      return;
    }
    if (
      recalculatingRef.current ||
      (hiddenRef.current && !carPlayConnectedRef.current)
    ) {
      return;
    }
    generationRef.current += 1;
    const generation = generationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRecalculating(true);
    recalculatingRef.current = true;
    offRouteRef.current = markRecalculateStarted(offRouteRef.current, now());
    speechEngine.cancel();
    voiceRef.current = resetVoiceMemory();
    pushCarPlay(null, { cancelSpeech: true });
    setInstruction(GPX_JOIN_CALCULATING_MESSAGE);
    setStatusLabel(gpxStatusLabel("joining_gpx", runtime.offRoute));

    const currentRequest = requestRef.current;
    let result: Awaited<ReturnType<typeof joinRoute>>;
    try {
      result = await joinRouteRef.current(
        {
          start: from,
          destination: to,
          style: currentRequest.style ?? "touring",
          preferences: currentRequest.preferences,
        },
        controller.signal,
      );
    } catch {
      if (generation !== generationRef.current || controller.signal.aborted) {
        offRouteRef.current = markRecalculateAborted(offRouteRef.current);
        setRecalculating(false);
        recalculatingRef.current = false;
        return;
      }
      setRecalculating(false);
      recalculatingRef.current = false;
      setRecalcError({
        code: "PROVIDER_ERROR",
        message:
          "Le raccordement vers le trajet GPX a échoué. Le tracé importé reste affiché.",
        suggestions: ["Réessayez dans quelques instants."],
      });
      return;
    }

    if (
      generation !== generationRef.current ||
      controller.signal.aborted ||
      stoppedRef.current
    ) {
      offRouteRef.current = markRecalculateAborted(offRouteRef.current);
      setRecalculating(false);
      recalculatingRef.current = false;
      return;
    }

    setRecalculating(false);
    recalculatingRef.current = false;
    if (!result.ok) {
      if (result.error.code !== "STALE_RECALCULATE") {
        setRecalcError(result.error);
      }
      return;
    }

    setRecalcError(null);
    const latest = gpxRuntimeRef.current ?? runtime;
    const next = attachGpxConnector(
      latest,
      connectorFromProvider(result.route),
      to,
    );
    gpxRuntimeRef.current = next;
    progressRef.current = 0;
    progressSnapshotRef.current = null;
    publishGpxOverlay(next);
    setInstruction(JOINING_GPX_MESSAGE);
    setStatusLabel(gpxStatusLabel(next.phase, next.offRoute));
    pushCarPlay(null);
  }, [now, publishGpxOverlay, pushCarPlay, speechEngine]);

  useEffect(() => {
    runRecalculateRef.current = runRecalculate;
  }, [runRecalculate]);
  useEffect(() => {
    fetchGpxJoinRef.current = fetchGpxJoin;
  }, [fetchGpxJoin]);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = carPlayDisplay.subscribe((event) => {
      if (cancelled) {
        return;
      }
      if (event.type === "connection") {
        setCarPlayConnected(event.connected);
        carPlayConnectedRef.current = event.connected;
        ownsVoiceRef.current = event.connected;
        if (event.connected) {
          handOffVoiceToCarPlay();
        } else {
          voiceHandedToCarPlayRef.current = false;
        }
      }
      if (event.type === "mute") {
        mutedRef.current = event.muted;
        setMuted(event.muted);
        if (event.muted) {
          speechEngine.cancel();
        }
        pushCarPlay(null);
      }
      if (event.type === "stop") {
        handleStopRef.current();
      }
    });
    void carPlayDisplay
      .start(
        toCarPlaySessionSnapshot({
          routeId: routeRef.current.id,
          geometry: routeRef.current.geometry,
          progress: null,
          userLocation: null,
          headingDeg: null,
          muted: mutedRef.current,
          remainingDistanceKm: routeRef.current.distanceKm,
          remainingDurationMinutes: routeRef.current.durationMinutes,
        }),
      )
      .then((connection) => {
        if (cancelled || !connection.connected) {
          return;
        }
        setCarPlayConnected(true);
        carPlayConnectedRef.current = true;
        ownsVoiceRef.current = connection.ownsVoice;
        if (connection.ownsVoice) {
          handOffVoiceToCarPlay();
        }
      });
    return () => {
      cancelled = true;
      unsubscribe();
      void carPlayDisplay.stop();
    };
  }, [carPlayDisplay, handOffVoiceToCarPlay, pushCarPlay, speechEngine]);

  useEffect(() => {
    function onVisibility() {
      const isHidden = document.visibilityState === "hidden";
      setHidden(isHidden);
      if (isHidden && !carPlayConnectedRef.current) {
        speechEngine.cancel();
        abortRef.current?.abort();
        offRouteRef.current = markRecalculateAborted(offRouteRef.current);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [speechEngine]);

  const shouldWatch = !hidden || carPlayConnected;

  useEffect(() => {
    if (!shouldWatch) {
      return;
    }
    const watch = locationWatch ?? createForegroundLocationWatch();
    const unsubscribe = watch.subscribe((event) => {
      try {
        if (stoppedRef.current) {
          return;
        }
        if (event.type === "error") {
          setGpsError(event.error.message);
          return;
        }
        setGpsError(null);
        setAccuracyMeters(event.fix.accuracyMeters);

        if (gpxRuntimeRef.current) {
          applyGpxFix(event.fix);
          return;
        }

        const active = routeRef.current;
        const evaluated = evaluateNavigationProgress({
          fix: event.fix,
          geometry: active.geometry,
          steps: active.steps ?? [],
          totalDistanceKm: active.distanceKm,
          totalDurationMinutes: active.durationMinutes,
          previousProgressKm: progressRef.current,
        });
        const display = navigationDisplayLocation({
          fix: event.fix.coordinates,
          progress: evaluated,
        });
        const heading = navigationDisplayHeading({
          gpsHeadingDeg: event.fix.headingDeg,
          geometry: active.geometry,
          segmentIndex: evaluated?.projection.segmentIndex,
        });
        setUserLocation(display);
        userLocationRef.current = display;
        headingRef.current = heading;
        setHeadingDeg(heading);
        onUserLocationRef.current?.(display, heading);

        if (!evaluated) {
          return;
        }

        applyEvaluatedProgress(evaluated, event.fix, active.geometry, null);

        const off = evaluateOffRoute({
          distanceToRouteM: evaluated.projection.distanceToRouteM,
          accuracyMeters: event.fix.accuracyMeters,
          progressKm: evaluated.projection.progressKm,
          nowMs: now(),
          navigating: true,
          recalculating: recalculatingRef.current,
          tracker: offRouteRef.current,
        });
        offRouteRef.current = off.tracker;
        if (off.decision.shouldRecalculate) {
          void runRecalculateRef.current(
            event.fix.coordinates,
            evaluated.projection.progressKm,
          );
        }
      } catch {
        // NFR-006: a bad GPS tick must not take down the navigation tree.
      }
    });

    function applyEvaluatedProgress(
      evaluated: NavigationProgress,
      fix: LocationFix,
      geometry: GeneratedRideRoute["geometry"],
      gpxPhaseLabel: string | null,
    ) {
      const display = navigationDisplayLocation({
        fix: fix.coordinates,
        progress: evaluated,
      });
      const heading = navigationDisplayHeading({
        gpsHeadingDeg: fix.headingDeg,
        geometry,
        segmentIndex: evaluated.projection.segmentIndex,
      });
      setUserLocation(display);
      userLocationRef.current = display;
      headingRef.current = heading;
      setHeadingDeg(heading);
      onUserLocationRef.current?.(display, heading);

      progressRef.current = evaluated.projection.progressKm;
      progressSnapshotRef.current = evaluated;
      remainingDistanceRef.current = evaluated.remainingDistanceKm;
      remainingMinutesRef.current = evaluated.remainingDurationMinutes;
      setProgressKm(evaluated.projection.progressKm);
      setRemainingDistanceKm(evaluated.remainingDistanceKm);
      setRemainingMinutes(evaluated.remainingDurationMinutes);
      setArrow(maneuverArrow(evaluated.nextStep));
      setNextRoad(evaluated.nextStep ? roadLabel(evaluated.nextStep) : undefined);
      setDistanceToManeuverKm(
        Number.isFinite(evaluated.distanceToNextManeuverM)
          ? evaluated.distanceToNextManeuverM / 1_000
          : 0,
      );
      if (evaluated.nextStep) {
        setInstruction(formatFrenchInstruction(evaluated.nextStep));
      }
      setStatusLabel(gpxPhaseLabel);

      const suspendedWithoutCarPlay =
        hiddenRef.current && !carPlayConnectedRef.current;
      if (evaluated.lowAccuracy || suspendedWithoutCarPlay) {
        pushCarPlay(null);
        return;
      }

      const announcement = decideAnnouncement({
        step: evaluated.nextStep,
        distanceToManeuverM: evaluated.distanceToNextManeuverM,
        muted: mutedRef.current,
        memory: voiceRef.current,
      });
      voiceRef.current = announcement.memory;
      if (announcement.speak && !ownsVoiceRef.current) {
        speechEngine.speak(announcement.speak);
      }
      pushCarPlay(ownsVoiceRef.current ? announcement.speak ?? null : null);
    }

    function applyGpxFix(fix: LocationFix) {
      let runtime = gpxRuntimeRef.current;
      if (!runtime) {
        return;
      }

      setUserLocation(fix.coordinates);
      userLocationRef.current = fix.coordinates;
      headingRef.current = fix.headingDeg ?? headingRef.current;
      if (typeof fix.headingDeg === "number") {
        setHeadingDeg(fix.headingDeg);
      }
      onUserLocationRef.current?.(fix.coordinates, fix.headingDeg ?? null);

      if (runtime.phase === "gpx_preview") {
        const started = beginGpxFromFix(runtime.original, fix);
        runtime = started.runtime;
        gpxRuntimeRef.current = runtime;
        publishGpxOverlay(runtime);
        setStatusLabel(gpxStatusLabel(runtime.phase, runtime.offRoute));
        if (started.joinTo) {
          void fetchGpxJoinRef.current(fix.coordinates, started.joinTo);
        }
      }

      if (runtime.phase === "gpx_completed") {
        setStatusLabel(gpxStatusLabel("gpx_completed", false));
        setRemainingDistanceKm(0);
        remainingDistanceRef.current = 0;
        return;
      }

      const onTrace = enterFollowingIfOnTrace({ runtime, fix });
      if (onTrace) {
        runtime = onTrace;
        gpxRuntimeRef.current = runtime;
        progressRef.current = 0;
        offRouteRef.current = emptyOffRouteTracker();
        publishGpxOverlay(runtime);
      }

      if (runtime.phase === "joining_gpx") {
        const connector = runtime.connector;
        if (!connector) {
          setStatusLabel(gpxStatusLabel("joining_gpx", runtime.offRoute));
          return;
        }
        const evaluated = evaluateNavigationProgress({
          fix,
          geometry: connector.geometry,
          steps: connector.steps,
          totalDistanceKm: connector.distanceKm,
          totalDurationMinutes: connector.durationMinutes,
          previousProgressKm: progressRef.current,
        });
        if (!evaluated) {
          return;
        }
        const remainingKm = combinedRemainingKm(
          evaluated.remainingDistanceKm,
          runtime.followRoute.distanceKm,
        );
        const remainingMin =
          evaluated.remainingDurationMinutes + runtime.followRoute.durationMinutes;
        applyEvaluatedProgress(
          {
            ...evaluated,
            remainingDistanceKm: remainingKm,
            remainingDurationMinutes: remainingMin,
          },
          fix,
          connector.geometry,
          gpxStatusLabel("joining_gpx", runtime.offRoute),
        );
        const off = evaluateOffRoute({
          distanceToRouteM: evaluated.projection.distanceToRouteM,
          accuracyMeters: fix.accuracyMeters,
          progressKm: evaluated.projection.progressKm,
          nowMs: now(),
          navigating: true,
          recalculating: recalculatingRef.current,
          tracker: offRouteRef.current,
          consecutiveFixes: GPX_OFF_ROUTE_CONSECUTIVE_FIXES,
          minDurationMs: GPX_OFF_ROUTE_MIN_DURATION_MS,
          cooldownMs: GPX_REJOIN_COOLDOWN_MS,
          minThresholdM: GPX_OFF_ROUTE_MIN_THRESHOLD_M,
          accuracyMultiplier: GPX_OFF_ROUTE_ACCURACY_MULTIPLIER,
        });
        offRouteRef.current = off.tracker;
        if (off.decision.shouldRecalculate && runtime.entry) {
          const entry = runtime.entry;
          runtime = { ...runtime, offRoute: true };
          gpxRuntimeRef.current = runtime;
          publishGpxOverlay(runtime);
          void fetchGpxJoinRef.current(fix.coordinates, entry.point);
        }
        return;
      }

      if (runtime.phase !== "following_gpx") {
        return;
      }

      const evaluated = evaluateNavigationProgress({
        fix,
        geometry: runtime.followRoute.geometry,
        steps: runtime.followRoute.steps ?? [],
        totalDistanceKm: runtime.followRoute.distanceKm,
        totalDurationMinutes: runtime.followRoute.durationMinutes,
        previousProgressKm: progressRef.current,
        gapBeforeVertex: new Set(runtime.followRoute.gapBeforeVertex),
      });
      if (!evaluated) {
        return;
      }
      runtime = {
        ...runtime,
        progressKm: evaluated.projection.progressKm,
      };
      gpxRuntimeRef.current = runtime;
      applyEvaluatedProgress(
        evaluated,
        fix,
        runtime.followRoute.geometry,
        gpxStatusLabel("following_gpx", runtime.offRoute),
      );

      if (
        followProgressComplete(
          evaluated.remainingDistanceKm,
          fix.accuracyMeters,
        )
      ) {
        runtime = markGpxCompleted(runtime);
        gpxRuntimeRef.current = runtime;
        publishGpxOverlay(runtime);
        setStatusLabel(gpxStatusLabel("gpx_completed", false));
        setRemainingDistanceKm(0);
        remainingDistanceRef.current = 0;
        return;
      }

      const off = evaluateOffRoute({
        distanceToRouteM: evaluated.projection.distanceToRouteM,
        accuracyMeters: fix.accuracyMeters,
        progressKm: evaluated.projection.progressKm,
        nowMs: now(),
        navigating: true,
        recalculating: recalculatingRef.current,
        tracker: offRouteRef.current,
        consecutiveFixes: GPX_OFF_ROUTE_CONSECUTIVE_FIXES,
        minDurationMs: GPX_OFF_ROUTE_MIN_DURATION_MS,
        cooldownMs: GPX_REJOIN_COOLDOWN_MS,
        minThresholdM: GPX_OFF_ROUTE_MIN_THRESHOLD_M,
        accuracyMultiplier: GPX_OFF_ROUTE_ACCURACY_MULTIPLIER,
      });
      offRouteRef.current = off.tracker;
      if (off.decision.shouldRecalculate) {
        const rejoin = selectGpxRejoinPoint({
          geometry: runtime.followRoute.geometry,
          gapBeforeVertex: runtime.followRoute.gapBeforeVertex,
          progressKm: evaluated.projection.progressKm,
        });
        if (rejoin) {
          runtime = {
            ...runtime,
            phase: "joining_gpx",
            offRoute: true,
            entry: {
              point: rejoin,
              segmentIndex: 0,
              t: 0,
              progressKm: evaluated.projection.progressKm,
              distanceM: evaluated.projection.distanceToRouteM,
            },
          };
          gpxRuntimeRef.current = runtime;
          publishGpxOverlay(runtime);
          setStatusLabel(gpxStatusLabel("joining_gpx", true));
          void fetchGpxJoinRef.current(fix.coordinates, rejoin);
        }
      }
    }

    return () => {
      unsubscribe();
      abortRef.current?.abort();
      speechEngine.cancel();
    };
  }, [carPlayDisplay, locationWatch, now, publishGpxOverlay, pushCarPlay, shouldWatch, speechEngine]);

  const session = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Navigation"
      className={
        renderMap
          ? "fixed inset-0 z-50 h-dvh bg-background text-foreground"
          : "pointer-events-none fixed inset-0 z-50 h-dvh bg-transparent text-foreground"
      }
    >
      {renderMap ? (
        <div className="absolute inset-0 flex flex-col">
          <NavigationMap
            route={currentRoute}
            overlay={gpxOverlay}
            userLocation={userLocation}
            headingDeg={headingDeg}
            engine={mapEngine}
            onRecenterReady={(recenter) => {
              recenterRef.current = recenter;
            }}
          />
        </div>
      ) : null}

      <NavigationOverlay
        arrow={arrow}
        instruction={instruction}
        nextRoad={nextRoad}
        distanceToManeuverKm={distanceToManeuverKm}
        remainingDistanceKm={remainingDistanceKm}
        remainingMinutes={remainingMinutes}
        nowMs={now()}
        accuracyMeters={accuracyMeters}
        gpsError={gpsError}
        recalculating={recalculating}
        hidden={hidden}
        carPlayConnected={carPlayConnected}
        muted={muted}
        recalcError={recalcError}
        statusLabel={statusLabel}
        onMuteToggle={() => {
          setMuted((current) => {
            const next = !current;
            mutedRef.current = next;
            if (next) {
              speechEngine.cancel();
            }
            pushCarPlay(null);
            return next;
          });
        }}
        onRecenter={() => {
          onRecenterRef.current?.();
          recenterRef.current();
        }}
        onOverview={() => {
          onOverviewPropRef.current?.();
        }}
        onStop={handleStop}
        onRetryRecalculate={() => {
          if (!userLocation) {
            return;
          }
          const runtime = gpxRuntimeRef.current;
          if (runtime?.entry) {
            void fetchGpxJoin(userLocation, runtime.entry.point);
            return;
          }
          void runRecalculate(userLocation, progressKm);
        }}
      />
    </div>
  );

  if (typeof document === "undefined") {
    return session;
  }
  return createPortal(session, document.body);
}
