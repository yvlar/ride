"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LocationWatch } from "@/domain/location/types";
import {
  evaluateNavigationProgress,
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
import type { GenerateRideRequest, GeneratedRideRoute, RideGenerationError } from "@/domain/ride/types";
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

export type NavigationSessionProps = {
  route: GeneratedRideRoute;
  request: GenerateRideRequest;
  onStop: () => void;
  onRouteChange?: (route: GeneratedRideRoute) => void;
  locationWatch?: LocationWatch;
  speech?: SpeechGuidance;
  recalculate?: (
    input: RecalculateRideInput,
    signal?: AbortSignal,
  ) => ReturnType<typeof requestRecalculatedRide>;
  now?: () => number;
  mapEngine?: NavigationMapProps["engine"];
  renderMap?: boolean;
  onUserLocation?: (point: Coordinates | null) => void;
  onRecenter?: () => void;
  wakeLock?: ScreenWakeLock;
};

export function NavigationSession({
  route,
  request,
  onStop,
  onRouteChange,
  locationWatch,
  speech,
  recalculate = requestRecalculatedRide,
  now = Date.now,
  mapEngine,
  renderMap = true,
  onUserLocation,
  onRecenter,
  wakeLock,
}: NavigationSessionProps) {
  const [currentRoute, setCurrentRoute] = useState(route);
  const [muted, setMuted] = useState(false);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [progressKm, setProgressKm] = useState(0);
  const [instruction, setInstruction] = useState("Recherche de la position…");
  const [arrow, setArrow] = useState("↑");
  const [nextRoad, setNextRoad] = useState<string | undefined>();
  const [distanceToManeuverKm, setDistanceToManeuverKm] = useState(0);
  const [remainingDistanceKm, setRemainingDistanceKm] = useState(route.distanceKm);
  const [remainingMinutes, setRemainingMinutes] = useState(route.durationMinutes);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [recalcError, setRecalcError] = useState<RideGenerationError | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [hidden, setHidden] = useState(false);
  const recenterRef = useRef<() => void>(() => {});
  const onUserLocationRef = useRef(onUserLocation);
  const onRecenterRef = useRef(onRecenter);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const progressRef = useRef<number | null>(null);
  const offRouteRef = useRef(emptyOffRouteTracker());
  const voiceRef = useRef(emptyVoiceMemory());
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const routeRef = useRef(currentRoute);
  const mutedRef = useRef(muted);
  const recalculatingRef = useRef(false);
  const hiddenRef = useRef(false);
  const runRecalculateRef = useRef<
    (
      currentPosition: { latitude: number; longitude: number },
      currentProgressKm: number,
    ) => Promise<void>
  >(async () => {});

  const speechEngine = useMemo(
    () => speech ?? createSpeechGuidance(),
    [speech],
  );
  const screenWakeLock = useMemo(
    () => wakeLock ?? createForegroundScreenWakeLock(),
    [wakeLock],
  );

  useEffect(() => {
    routeRef.current = currentRoute;
  }, [currentRoute]);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  useEffect(() => {
    recalculatingRef.current = recalculating;
  }, [recalculating]);
  useEffect(() => {
    hiddenRef.current = hidden;
  }, [hidden]);
  useEffect(() => {
    onUserLocationRef.current = onUserLocation;
  }, [onUserLocation]);
  useEffect(() => {
    onRecenterRef.current = onRecenter;
  }, [onRecenter]);

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

  const runRecalculate = useCallback(async (
    currentPosition: { latitude: number; longitude: number },
    currentProgressKm: number,
  ) => {
    if (recalculatingRef.current || hiddenRef.current) {
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

    const result = await recalculate(
      {
        currentPosition,
        progressKm: currentProgressKm,
        request,
        originalRoute: routeRef.current,
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
    onRouteChange?.(result.route);
  }, [now, onRouteChange, recalculate, request, speechEngine]);

  useEffect(() => {
    runRecalculateRef.current = runRecalculate;
  }, [runRecalculate]);

  useEffect(() => {
    function onVisibility() {
      const isHidden = document.visibilityState === "hidden";
      setHidden(isHidden);
      if (isHidden) {
        speechEngine.cancel();
        abortRef.current?.abort();
        offRouteRef.current = markRecalculateAborted(offRouteRef.current);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [speechEngine]);

  useEffect(() => {
    if (hidden) {
      return;
    }
    const watch = locationWatch ?? createForegroundLocationWatch();
    const unsubscribe = watch.subscribe((event) => {
      try {
        if (event.type === "error") {
          setGpsError(event.error.message);
          return;
        }
        setGpsError(null);
        setAccuracyMeters(event.fix.accuracyMeters);
        setUserLocation(event.fix.coordinates);
        onUserLocationRef.current?.(event.fix.coordinates);

        const active = routeRef.current;
        const evaluated = evaluateNavigationProgress({
          fix: event.fix,
          geometry: active.geometry,
          steps: active.steps ?? [],
          totalDistanceKm: active.distanceKm,
          totalDurationMinutes: active.durationMinutes,
          previousProgressKm: progressRef.current,
        });
        if (!evaluated) {
          return;
        }

        progressRef.current = evaluated.projection.progressKm;
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

        if (evaluated.lowAccuracy || hiddenRef.current) {
          return;
        }

        const announcement = decideAnnouncement({
          step: evaluated.nextStep,
          distanceToManeuverM: evaluated.distanceToNextManeuverM,
          muted: mutedRef.current,
          memory: voiceRef.current,
        });
        voiceRef.current = announcement.memory;
        if (announcement.speak) {
          speechEngine.speak(announcement.speak);
        }

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

    return () => {
      unsubscribe();
      abortRef.current?.abort();
      speechEngine.cancel();
    };
  }, [hidden, locationWatch, now, speechEngine]);

  function handleStop() {
    abortRef.current?.abort();
    speechEngine.cancel();
    onStop();
  }

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
            userLocation={userLocation}
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
        muted={muted}
        recalcError={recalcError}
        onMuteToggle={() => setMuted((current) => !current)}
        onRecenter={() => {
          onRecenterRef.current?.();
          recenterRef.current();
        }}
        onStop={handleStop}
        onRetryRecalculate={() => {
          if (userLocation) {
            void runRecalculate(userLocation, progressKm);
          }
        }}
      />
    </div>
  );

  if (typeof document === "undefined") {
    return session;
  }
  return createPortal(session, document.body);
}
