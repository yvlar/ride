"use client";

import { useEffect, useRef, useState } from "react";
import {
  composeDescribedRegenerateRequest,
  composeDescribedRide,
  describedRequestFromGeneratedRoute,
  describedRouteMatchesReturnToStart,
  describedStartPlace,
} from "@/application/compose-described-ride";
import { DescribeDistanceSlider } from "@/components/app/describe-distance-slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  requestGeneratedRide,
  type GenerateRideClientOptions,
} from "@/components/ride-form/request-generated-ride";
import { requestRegeneratedRide } from "@/components/ride-form/request-regenerated-ride";
import {
  CurrentPositionError,
  type GeolocationFailureReason,
} from "@/components/ride-form/browser-geolocation";
import {
  formatDistanceLabel,
  formatDurationLabel,
  formatEta,
} from "@/components/navigation/format-navigation";
import { requestDevicePosition } from "@/infrastructure/location/request-device-coordinates";
import type { LocatedPosition } from "@/domain/location/types";
import {
  readStoredDescribeDistanceKm,
  snapDescribeDistanceKm,
  writeStoredDescribeDistanceKm,
} from "@/domain/ride/describe-distance";
import {
  readStoredDescribeLoop,
  writeStoredDescribeLoop,
} from "@/domain/ride/describe-loop";
import {
  readStoredRoutePreferences,
  readStoredRouteStyle,
} from "@/domain/ride/stored-route-preferences";
import { previousRideSignature } from "@/domain/ride/route-signature";
import {
  principalRoadNames,
  routeShareSummary,
} from "@/domain/ride/route-share";
import { generatedRouteTypeLabel, RIDE_STYLE_LABELS } from "@/domain/ride/summarize-request";
import type { Place } from "@/domain/geo/types";
import type {
  GenerateRideRequest,
  GenerateRideResult,
  GeneratedRideRoute,
  RideGenerationError,
} from "@/domain/ride/types";

const GENERATION_UNAVAILABLE: RideGenerationError = {
  code: "PROVIDER_ERROR",
  message:
    "Le service de cartographie ne répond pas. Réessayez dans quelques instants.",
  suggestions: ["Réessayez."],
};

type LocationStatus =
  | "locating"
  | "detected"
  | "permission_denied"
  | "unavailable";

function locationStatusFromReason(
  reason: GeolocationFailureReason,
): Exclude<LocationStatus, "locating" | "detected"> {
  return reason === "permission_denied" ? "permission_denied" : "unavailable";
}

function locationStatusMessage(status: LocationStatus): string {
  if (status === "locating") {
    return "Recherche de la position…";
  }
  if (status === "detected") {
    return "Position détectée";
  }
  if (status === "permission_denied") {
    return "L’autorisation de localisation a été refusée.";
  }
  return "La position actuelle est indisponible.";
}

export type DescribeRidePanelProps = {
  generateRide?: (
    request: GenerateRideRequest,
    options?: GenerateRideClientOptions,
  ) => Promise<GenerateRideResult>;
  regenerateRide?: typeof requestRegeneratedRide;
  requestPosition?: () => Promise<LocatedPosition>;
  onRequestComposed: (request: GenerateRideRequest) => void;
  onGeneratedRouteChange: (route: GeneratedRideRoute) => void;
  onStartNavigation: (options?: { muted?: boolean }) => void;
  onBack: () => void;
  /** Injected so the arrival time is deterministic under test. */
  now?: () => number;
};

export function DescribeRidePanel({
  generateRide = requestGeneratedRide,
  regenerateRide = requestRegeneratedRide,
  requestPosition = requestDevicePosition,
  onRequestComposed,
  onGeneratedRouteChange,
  onStartNavigation,
  onBack,
  now = Date.now,
}: DescribeRidePanelProps) {
  const [distanceKm, setDistanceKm] = useState(() =>
    readStoredDescribeDistanceKm(
      typeof window === "undefined" ? null : window.localStorage,
    ),
  );
  const [returnToStart, setReturnToStart] = useState(() =>
    readStoredDescribeLoop(
      typeof window === "undefined" ? null : window.localStorage,
    ),
  );
  const [start, setStart] = useState<Place | null>(null);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [locationStatus, setLocationStatus] =
    useState<LocationStatus>("locating");
  const [composedRequest, setComposedRequest] =
    useState<GenerateRideRequest | null>(null);
  const [displayedRoute, setDisplayedRoute] =
    useState<GeneratedRideRoute | null>(null);
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [generationError, setGenerationError] =
    useState<RideGenerationError | null>(null);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const generationId = useRef(0);
  // Ignore overlapping one-shot GPS results (FR-034): a slower mount locate
  // must not overwrite a newer generate/regenerate/retry fix.
  const locateGeneration = useRef(0);
  const inFlightRef = useRef(false);
  const retryActionRef = useRef<"generate" | "regenerate">("generate");
  const startRef = useRef(start);
  const accuracyRef = useRef(accuracyMeters);
  const busy = generating || regenerating;
  const activeRoute = displayedRoute;

  useEffect(() => {
    startRef.current = start;
    accuracyRef.current = accuracyMeters;
  }, [start, accuracyMeters]);

  useEffect(() => {
    void locate();
    // One-shot precise fix when the describe flow opens (FR-034).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only locate
  }, []);

  function persistDistance(next: number) {
    const snapped = snapDescribeDistanceKm(next);
    setDistanceKm(snapped);
    writeStoredDescribeDistanceKm(
      typeof window === "undefined" ? null : window.localStorage,
      snapped,
    );
  }

  function persistLoop(next: boolean) {
    setReturnToStart(next);
    writeStoredDescribeLoop(
      typeof window === "undefined" ? null : window.localStorage,
      next,
    );
  }

  async function locate(): Promise<LocatedPosition | null> {
    const requestId = locateGeneration.current + 1;
    locateGeneration.current = requestId;
    setLocationStatus("locating");
    try {
      const located = await requestPosition();
      if (locateGeneration.current !== requestId) {
        return null;
      }
      const place = describedStartPlace(located.coordinates);
      startRef.current = place;
      accuracyRef.current = located.accuracyMeters;
      setStart(place);
      setAccuracyMeters(located.accuracyMeters);
      setLocationStatus("detected");
      return located;
    } catch (error) {
      if (locateGeneration.current !== requestId) {
        return null;
      }
      const reason =
        error instanceof CurrentPositionError ? error.reason : "unknown";
      setLocationStatus(locationStatusFromReason(reason));
      if (!startRef.current) {
        setStart(null);
      }
      return null;
    }
  }

  async function refreshStart(): Promise<{
    start: Place;
    accuracyMeters: number | null;
  } | null> {
    const located = await locate();
    if (!located || !startRef.current) {
      return null;
    }
    return {
      start: startRef.current,
      accuracyMeters: located.accuracyMeters,
    };
  }

  async function handleGenerate() {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    const requestId = generationId.current + 1;
    generationId.current = requestId;
    setGenerating(true);
    setGenerationError(null);
    try {
      const located = await refreshStart();
      if (generationId.current !== requestId) {
        return;
      }
      if (!located) {
        retryActionRef.current = "generate";
        return;
      }
      const preferences = readStoredRoutePreferences(
        typeof window === "undefined" ? null : window.sessionStorage,
      );
      const style = readStoredRouteStyle(
        typeof window === "undefined" ? null : window.sessionStorage,
      );
      const composed = composeDescribedRide({
        start: located.start,
        targetDistanceKm: distanceKm,
        style,
        preferences,
      });
      if (!composed.ok) {
        setGenerationError({
          code: "VALIDATION_ERROR",
          message: composed.errors[0]?.message ?? "La demande est invalide.",
          suggestions: ["Réessayez."],
        });
        return;
      }
      const generated = await generateRide(composed.request, {
        useAiWebGeneration: true,
        originAccuracyMeters: located.accuracyMeters,
        returnToStart,
      });
      if (generationId.current !== requestId) {
        return;
      }
      if (generated.ok) {
        const persisted =
          generated.route.type === "destination"
            ? describedRequestFromGeneratedRoute(
                generated.route,
                composed.request.preferences ?? preferences,
              ) ?? composed.request
            : composed.request;
        setComposedRequest(persisted);
        onRequestComposed(persisted);
        setDisplayedRoute(generated.route);
        onGeneratedRouteChange(generated.route);
        return;
      }
      retryActionRef.current = "generate";
      setGenerationError(generated.error);
    } catch {
      if (generationId.current !== requestId) {
        return;
      }
      retryActionRef.current = "generate";
      setGenerationError(GENERATION_UNAVAILABLE);
    } finally {
      if (generationId.current === requestId) {
        inFlightRef.current = false;
        setGenerating(false);
      }
    }
  }

  async function handleRegenerate() {
    if (!composedRequest || !activeRoute || inFlightRef.current) {
      return;
    }
    if (!describedRouteMatchesReturnToStart(activeRoute, returnToStart)) {
      await handleGenerate();
      return;
    }
    inFlightRef.current = true;
    const requestId = generationId.current + 1;
    generationId.current = requestId;
    setRegenerating(true);
    setGenerationError(null);
    try {
      const located = await refreshStart();
      if (generationId.current !== requestId) {
        return;
      }
      if (!located) {
        retryActionRef.current = "regenerate";
        return;
      }
      const preferences = readStoredRoutePreferences(
        typeof window === "undefined" ? null : window.sessionStorage,
      );
      const style = readStoredRouteStyle(
        typeof window === "undefined" ? null : window.sessionStorage,
      );
      const composed = composeDescribedRegenerateRequest({
        start: located.start,
        targetDistanceKm: distanceKm,
        style,
        preferences,
        previousRoute: activeRoute,
      });
      if (!composed.ok) {
        setGenerationError({
          code: "VALIDATION_ERROR",
          message: composed.errors[0]?.message ?? "La demande est invalide.",
          suggestions: ["Réessayez."],
        });
        return;
      }
      const generated = await regenerateRide(composed.request, activeRoute, {
        useAiWebGeneration: true,
        originAccuracyMeters: located.accuracyMeters,
        returnToStart,
        previousRouteSignature: previousRideSignature({
          id: activeRoute.id,
          geometry: activeRoute.geometry,
        }),
      });
      if (generationId.current !== requestId) {
        return;
      }
      if (generated.ok) {
        const persisted =
          generated.route.type === "destination"
            ? describedRequestFromGeneratedRoute(
                generated.route,
                composed.request.preferences ?? preferences,
              ) ?? composed.request
            : composed.request;
        setComposedRequest(persisted);
        onRequestComposed(persisted);
        setDisplayedRoute(generated.route);
        onGeneratedRouteChange(generated.route);
        return;
      }
      retryActionRef.current = "regenerate";
      setGenerationError(generated.error);
    } catch {
      if (generationId.current !== requestId) {
        return;
      }
      retryActionRef.current = "regenerate";
      setGenerationError(GENERATION_UNAVAILABLE);
    } finally {
      if (generationId.current === requestId) {
        inFlightRef.current = false;
        setRegenerating(false);
      }
    }
  }

  /**
   * FR-042 — abandon a slow generation without losing the ride already on
   * screen. Bumping the generation id makes the in-flight result a no-op.
   */
  function handleCancelGeneration() {
    if (!inFlightRef.current) {
      return;
    }
    generationId.current += 1;
    locateGeneration.current += 1;
    inFlightRef.current = false;
    setGenerating(false);
    setRegenerating(false);
    if (!startRef.current) {
      setLocationStatus("unavailable");
    }
  }

  function handleRetry() {
    if (retryActionRef.current === "regenerate") {
      void handleRegenerate();
      return;
    }
    void handleGenerate();
  }

  return (
    <div aria-busy={busy}>
      <p
        role="status"
        className="rounded-2xl bg-card/65 px-3 py-2 text-sm text-muted-foreground"
        data-start-latitude={
          start ? String(start.coordinates.latitude) : undefined
        }
        data-start-longitude={
          start ? String(start.coordinates.longitude) : undefined
        }
      >
        {locationStatusMessage(locationStatus)}
      </p>
      {locationStatus === "permission_denied" ||
      locationStatus === "unavailable" ? (
        <Button
          type="button"
          variant="outline"
          className="mt-2 min-h-12 w-full text-base"
          disabled={busy}
          onClick={() => void locate()}
        >
          Réessayer la localisation
        </Button>
      ) : null}

      <div className="mt-4">
        <DescribeDistanceSlider
          value={distanceKm}
          disabled={busy}
          onChange={persistDistance}
        />
      </div>

      <div className="ride-control-row mt-3 flex items-center justify-between gap-3">
        <div>
          <Label htmlFor="describe-loop" className="text-base">
            Boucle
          </Label>
          <p className="text-sm text-muted-foreground">Revenir au départ</p>
        </div>
        <Switch
          id="describe-loop"
          checked={returnToStart}
          disabled={busy}
          onCheckedChange={persistLoop}
        />
      </div>

      {busy && (regenerating || locationStatus === "detected") ? (
        <div className="mt-4 space-y-2">
          <p role="status" className="text-sm text-muted-foreground">
            {regenerating
              ? "Régénération en cours… le trajet actuel reste affiché."
              : "L’IA prépare votre trajet moto…"}
          </p>
          <div
            role="progressbar"
            aria-label="Génération du trajet"
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-12 w-full text-base"
            onClick={handleCancelGeneration}
          >
            Annuler la génération
          </Button>
        </div>
      ) : null}

      {activeRoute ? (
        <section aria-label="Trajet généré" className="mt-4 space-y-3">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div>
              <dd className="text-xl font-semibold leading-7 tabular-nums">
                {formatDistanceLabel(activeRoute.distanceKm)}
              </dd>
              <dt className="text-xs leading-4 text-muted-foreground">distance</dt>
            </div>
            <div>
              <dd className="text-xl font-semibold leading-7 tabular-nums">
                {formatDurationLabel(activeRoute.durationMinutes)}
              </dd>
              <dt className="text-xs leading-4 text-muted-foreground">durée</dt>
            </div>
            <div>
              <dd className="text-xl font-semibold leading-7 tabular-nums">
                {formatEta(now(), activeRoute.durationMinutes)}
              </dd>
              <dt className="text-xs leading-4 text-muted-foreground">arrivée</dt>
            </div>
          </dl>
          <p className="text-sm leading-6 text-muted-foreground">
            {generatedRouteTypeLabel(activeRoute.type)} ·{" "}
            {RIDE_STYLE_LABELS[activeRoute.style ?? "scenic"]}
          </p>
          <div className="ride-control-row flex items-center justify-between gap-3">
            <Label htmlFor="describe-voice" className="text-base">
              Guidage vocal {voiceMuted ? "(désactivé)" : "(activé)"}
            </Label>
            <Switch
              id="describe-voice"
              checked={!voiceMuted}
              disabled={busy}
              onCheckedChange={(checked) => setVoiceMuted(!checked)}
            />
          </div>
          {(() => {
            const shares = routeShareSummary(activeRoute.segments);
            const roads = principalRoadNames(activeRoute.segments);
            return (
              <>
                {roads.length > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Routes : {roads.join(", ")}
                  </p>
                ) : null}
                {shares.highwayPercent !== null ? (
                  <p className="text-sm text-muted-foreground">
                    Autoroute : {shares.highwayPercent} %
                  </p>
                ) : null}
                {shares.unpavedPercent !== null ? (
                  <p className="text-sm text-muted-foreground">
                    Non asphalté : {shares.unpavedPercent} %
                  </p>
                ) : null}
              </>
            );
          })()}
          {activeRoute.warnings.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {activeRoute.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {generationError ? (
        <div role="alert" className="mt-3 space-y-2 text-sm leading-6">
          <p className="text-destructive">{generationError.message}</p>
          {generationError.suggestions.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {generationError.suggestions.map((suggestion) => (
                <li key={suggestion}>{suggestion}</li>
              ))}
            </ul>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="min-h-12 w-full text-base"
            disabled={busy}
            onClick={handleRetry}
          >
            Réessayer
          </Button>
        </div>
      ) : null}

      <div
        className="ride-panel-actions"
        role={activeRoute ? "group" : undefined}
        aria-label={activeRoute ? "Actions du trajet" : undefined}
      >
        {activeRoute ? (
          <>
            <Button
              type="button"
              size="lg"
              className="min-h-12 w-full text-base"
              disabled={busy}
              aria-label="Démarrer la navigation"
              onClick={() => onStartNavigation({ muted: voiceMuted })}
            >
              Démarrer la navigation
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="min-h-12 w-full text-base"
              disabled={busy}
              aria-busy={regenerating}
              onClick={() => void handleRegenerate()}
            >
              {regenerating ? "Régénération en cours…" : "Régénérer"}
            </Button>
          </>
        ) : null}
        <Button
          type="button"
          size="lg"
          className="min-h-12 w-full text-base"
          disabled={busy || (Boolean(activeRoute) && generating)}
          aria-busy={generating}
          onClick={() => void handleGenerate()}
        >
          {generating ? "Génération…" : "Générer mon trajet"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="min-h-12 w-full"
          disabled={busy}
          onClick={onBack}
        >
          Retour
        </Button>
      </div>
    </div>
  );
}
