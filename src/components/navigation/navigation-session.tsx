"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LocationWatch } from "@/domain/location/types";
import { FOREGROUND_ONLY_MESSAGE } from "@/domain/navigation/session-copy";
import {
  evaluateNavigationProgress,
} from "@/domain/navigation/progress";
import {
  emptyOffRouteTracker,
  evaluateOffRoute,
  markRecalculateStarted,
} from "@/domain/navigation/off-route";
import { decideAnnouncement, emptyVoiceMemory, resetVoiceMemory } from "@/domain/navigation/voice";
import { formatFrenchInstruction, roadLabel } from "@/domain/navigation/instructions";
import type { GenerateRideRequest, GeneratedRideRoute, RideGenerationError } from "@/domain/ride/types";
import { Button } from "@/components/ui/button";
import { createBrowserLocationWatch } from "@/infrastructure/location/browser-location-watch";
import { createSpeechGuidance, type SpeechGuidance } from "@/infrastructure/voice/speech-guidance";
import { NavigationMap, type NavigationMapProps } from "./navigation-map";
import { maneuverArrow } from "./maneuver-arrow";
import {
  formatAccuracyLabel,
  formatDistanceLabel,
  formatDurationLabel,
  formatEta,
} from "./format-navigation";
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
  const [lowAccuracy, setLowAccuracy] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [recalcError, setRecalcError] = useState<RideGenerationError | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [hidden, setHidden] = useState(false);
  const recenterRef = useRef<() => void>(() => {});
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
    speechEngine.setMuted(muted);
  }, [muted, speechEngine]);

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
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [speechEngine]);

  useEffect(() => {
    const watch = locationWatch ?? createBrowserLocationWatch();
    const unsubscribe = watch.subscribe((event) => {
      if (event.type === "error") {
        setGpsError(event.error.message);
        return;
      }
      setGpsError(null);
      setAccuracyMeters(event.fix.accuracyMeters);
      setUserLocation(event.fix.coordinates);

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
      setLowAccuracy(evaluated.lowAccuracy);
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
    });

    return () => {
      unsubscribe();
      abortRef.current?.abort();
      speechEngine.cancel();
    };
  }, [locationWatch, now, speechEngine]);

  function handleStop() {
    abortRef.current?.abort();
    speechEngine.cancel();
    onStop();
  }

  return (
    <div
      role="dialog"
      aria-label="Navigation"
      className="fixed inset-0 z-50 flex flex-col bg-background text-foreground"
    >
      <header className="flex items-start gap-3 border-b border-border px-4 py-3">
        <p
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary text-2xl text-primary-foreground"
        >
          {arrow}
        </p>
        <div className="min-w-0 flex-1">
          <p className="text-xl font-semibold leading-7">{instruction}</p>
          <p className="text-sm text-muted-foreground">
            {formatDistanceLabel(distanceToManeuverKm)}
            {nextRoad ? ` · ${nextRoad}` : ""}
          </p>
        </div>
      </header>

      <NavigationMap
        route={currentRoute}
        userLocation={userLocation}
        engine={mapEngine}
        onRecenterReady={(recenter) => {
          recenterRef.current = recenter;
        }}
      />

      <footer className="space-y-3 border-t border-border px-4 py-3">
        <p className="text-sm leading-6 text-muted-foreground">
          {formatDistanceLabel(remainingDistanceKm)} restants ·{" "}
          {formatDurationLabel(remainingMinutes)} · ETA {formatEta(now(), remainingMinutes)}
        </p>
        <p className="text-sm leading-6" role="status">
          {gpsError ??
            (lowAccuracy
              ? formatAccuracyLabel(accuracyMeters)
              : formatAccuracyLabel(accuracyMeters))}
          {recalculating ? " · Recalcul du trajet…" : ""}
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          {FOREGROUND_ONLY_MESSAGE}
        </p>
        {hidden ? (
          <p role="status" className="text-sm text-destructive">
            La navigation nécessite que l’application reste ouverte au premier
            plan.
          </p>
        ) : null}
        {recalcError ? (
          <div role="alert" className="space-y-2 text-sm">
            <p className="text-destructive">{recalcError.message}</p>
            <Button
              type="button"
              className="min-h-12 min-w-12"
              onClick={() => {
                if (userLocation) {
                  void runRecalculate(userLocation, progressKm);
                }
              }}
            >
              Réessayer
            </Button>
          </div>
        ) : null}
        <div className="grid grid-cols-3 gap-2">
          <Button
            type="button"
            variant={muted ? "secondary" : "outline"}
            className="min-h-12 min-w-12 text-base"
            aria-pressed={muted}
            onClick={() => setMuted((current) => !current)}
          >
            {muted ? "Son" : "Muet"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-12 min-w-12 text-base"
            onClick={() => recenterRef.current()}
          >
            Recentrer
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="min-h-12 min-w-12 text-base"
            onClick={handleStop}
          >
            Arrêter
          </Button>
        </div>
      </footer>
    </div>
  );
}
