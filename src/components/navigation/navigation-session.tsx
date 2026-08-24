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
import type { NavigationProgress } from "@/domain/navigation/types";
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
  carPlay,
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
  const [carPlayConnected, setCarPlayConnected] = useState(false);
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
  const carPlayConnectedRef = useRef(false);
  const ownsVoiceRef = useRef(false);
  const headingRef = useRef<number | null>(null);
  const userLocationRef = useRef<Coordinates | null>(null);
  const progressSnapshotRef = useRef<NavigationProgress | null>(null);
  const remainingDistanceRef = useRef(route.distanceKm);
  const remainingMinutesRef = useRef(route.durationMinutes);
  const stoppedRef = useRef(false);
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

  const pushCarPlay = useCallback(
    (speakText: string | null, options?: { cancelSpeech?: boolean }) => {
      if (stoppedRef.current) {
        return;
      }
      void carPlayDisplay.update(
        toCarPlaySessionSnapshot({
          routeId: routeRef.current.id,
          geometry: routeRef.current.geometry,
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
    abortRef.current?.abort();
    speechEngine.cancel();
    void carPlayDisplay.stop();
    onStop();
  }, [carPlayDisplay, onStop, speechEngine]);
  const handleStopRef = useRef(handleStop);
  useEffect(() => {
    handleStopRef.current = handleStop;
  }, [handleStop]);

  const runRecalculate = useCallback(async (
    currentPosition: { latitude: number; longitude: number },
    currentProgressKm: number,
  ) => {
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
  }, [now, onRouteChange, pushCarPlay, recalculate, request, speechEngine]);

  useEffect(() => {
    runRecalculateRef.current = runRecalculate;
  }, [runRecalculate]);

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
          speechEngine.cancel();
        }
      }
      if (event.type === "mute") {
        mutedRef.current = event.muted;
        setMuted(event.muted);
        if (event.muted) {
          speechEngine.cancel();
        }
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
          speechEngine.cancel();
        }
      });
    return () => {
      cancelled = true;
      unsubscribe();
      void carPlayDisplay.stop();
    };
  }, [carPlayDisplay, speechEngine]);

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
        setUserLocation(event.fix.coordinates);
        userLocationRef.current = event.fix.coordinates;
        headingRef.current = event.fix.headingDeg ?? null;
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
  }, [carPlayDisplay, locationWatch, now, pushCarPlay, shouldWatch, speechEngine]);

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
        carPlayConnected={carPlayConnected}
        muted={muted}
        recalcError={recalcError}
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
