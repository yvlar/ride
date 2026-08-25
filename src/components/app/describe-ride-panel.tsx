"use client";

import { useEffect, useRef, useState } from "react";
import {
  composeDescribedRide,
  DESCRIBE_DEFAULT_PREFERENCES,
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
} from "@/components/navigation/format-navigation";
import { requestDevicePosition } from "@/infrastructure/location/request-device-coordinates";
import type { LocatedPosition } from "@/domain/location/types";
import {
  readStoredDescribeDistanceKm,
  snapDescribeDistanceKm,
  writeStoredDescribeDistanceKm,
} from "@/domain/ride/describe-distance";
import { previousRideSignature } from "@/domain/ride/route-signature";
import {
  principalRoadNames,
  routeShareSummary,
} from "@/domain/ride/route-share";
import { RIDE_STYLE_LABELS, RIDE_TYPE_LABELS } from "@/domain/ride/summarize-request";
import type { Place } from "@/domain/geo/types";
import type {
  GenerateRideRequest,
  GenerateRideResult,
  GeneratedRideRoute,
  RideGenerationError,
  RoutePreferences,
} from "@/domain/ride/types";
import { cn } from "@/lib/utils";

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
};

export function DescribeRidePanel({
  generateRide = requestGeneratedRide,
  regenerateRide = requestRegeneratedRide,
  requestPosition = requestDevicePosition,
  onRequestComposed,
  onGeneratedRouteChange,
  onStartNavigation,
  onBack,
}: DescribeRidePanelProps) {
  const [distanceKm, setDistanceKm] = useState(() =>
    readStoredDescribeDistanceKm(
      typeof window === "undefined" ? null : window.localStorage,
    ),
  );
  const [preferences, setPreferences] = useState<RoutePreferences>(
    DESCRIBE_DEFAULT_PREFERENCES,
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

  async function locate(): Promise<LocatedPosition | null> {
    setLocationStatus("locating");
    try {
      const located = await requestPosition();
      const place = describedStartPlace(located.coordinates);
      startRef.current = place;
      accuracyRef.current = located.accuracyMeters;
      setStart(place);
      setAccuracyMeters(located.accuracyMeters);
      setLocationStatus("detected");
      return located;
    } catch (error) {
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
      const composed = composeDescribedRide({
        start: located.start,
        targetDistanceKm: distanceKm,
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
      });
      if (generationId.current !== requestId) {
        return;
      }
      if (generated.ok) {
        setComposedRequest(composed.request);
        onRequestComposed(composed.request);
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
      const request = {
        ...composedRequest,
        start: located.start,
        targetDistanceKm: distanceKm,
        preferences,
      };
      const generated = await regenerateRide(request, activeRoute, {
        useAiWebGeneration: true,
        originAccuracyMeters: located.accuracyMeters,
        previousRouteSignature: previousRideSignature({
          id: activeRoute.id,
          geometry: activeRoute.geometry,
        }),
      });
      if (generationId.current !== requestId) {
        return;
      }
      if (generated.ok) {
        setComposedRequest(request);
        onRequestComposed(request);
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

  function handleRetry() {
    if (retryActionRef.current === "regenerate") {
      void handleRegenerate();
      return;
    }
    void handleGenerate();
  }

  return (
    <div aria-busy={busy}>
      <p role="status" className="text-sm text-muted-foreground">
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

      <div className="mt-4 space-y-2">
        <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border px-3">
          <Label htmlFor="describe-avoid-highways" className="text-base">
            Éviter les autoroutes
          </Label>
          <Switch
            id="describe-avoid-highways"
            checked={preferences.avoidHighways}
            disabled={busy}
            onCheckedChange={(checked) =>
              setPreferences((current) => ({
                ...current,
                avoidHighways: checked,
              }))
            }
          />
        </div>
        <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border px-3">
          <Label htmlFor="describe-avoid-unpaved" className="text-base">
            Éviter les routes non pavées
          </Label>
          <Switch
            id="describe-avoid-unpaved"
            checked={preferences.avoidUnpaved}
            disabled={busy}
            onCheckedChange={(checked) =>
              setPreferences((current) => ({
                ...current,
                avoidUnpaved: checked,
              }))
            }
          />
        </div>
        <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border px-3">
          <Label htmlFor="describe-stay-in-canada" className="text-base">
            Canada seulement
          </Label>
          <Switch
            id="describe-stay-in-canada"
            checked={Boolean(preferences.stayInCanada)}
            disabled={busy}
            onCheckedChange={(checked) =>
              setPreferences((current) => ({
                ...current,
                stayInCanada: checked,
              }))
            }
          />
        </div>
      </div>

      {busy && (regenerating || locationStatus === "detected") ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          {regenerating
            ? "Régénération en cours…"
            : "L’IA prépare votre trajet moto…"}
        </p>
      ) : null}

      {activeRoute ? (
        <section aria-label="Trajet généré" className="mt-4 space-y-3">
          <p className="text-base leading-6">
            {formatDistanceLabel(activeRoute.distanceKm)} ·{" "}
            {formatDurationLabel(activeRoute.durationMinutes)} ·{" "}
            {RIDE_TYPE_LABELS[activeRoute.type]} ·{" "}
            {RIDE_STYLE_LABELS[activeRoute.style ?? "scenic"]}
          </p>
          <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border px-3">
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
        className={cn(
          "sticky bottom-0 z-20 -mx-4 mt-3 space-y-2 border-t border-border bg-card/95 px-4 pt-3",
          "pb-[max(0.25rem,env(safe-area-inset-bottom))]",
        )}
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
