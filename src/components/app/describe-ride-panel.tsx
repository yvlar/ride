"use client";

import { useEffect, useRef, useState } from "react";
import { composeDescribedRide } from "@/application/compose-described-ride";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  LocateButton,
  PlaceSearchField,
} from "@/components/ride-form/place-search-field";
import { searchPlacesFromApi } from "@/components/ride-form/search-places";
import {
  requestGeneratedRide,
  type GenerateRideClientOptions,
} from "@/components/ride-form/request-generated-ride";
import { requestRegeneratedRide } from "@/components/ride-form/request-regenerated-ride";
import {
  formatDistanceLabel,
  formatDurationLabel,
} from "@/components/navigation/format-navigation";
import type { Coordinates, Place } from "@/domain/geo/types";
import {
  parseNaturalLanguageRide,
  type NaturalLanguageRideDraft,
} from "@/domain/ride/parse-natural-language";
import { RIDE_STYLE_OPTIONS } from "@/domain/ride/style-catalog";
import {
  principalRoadNames,
  routeShareSummary,
} from "@/domain/ride/route-share";
import {
  RIDE_STYLE_LABELS,
  RIDE_TYPE_LABELS,
  summarizeRideRequest,
} from "@/domain/ride/summarize-request";
import type {
  GenerateRideRequest,
  GenerateRideResult,
  GeneratedRideRoute,
  RideFormError,
  RideFormField,
  RideGenerationError,
  RideStyle,
  RideType,
} from "@/domain/ride/types";
import { cn } from "@/lib/utils";

const RIDE_TYPES: { value: RideType; label: string; description: string }[] = [
  { value: "loop", label: "Boucle", description: "Revenir au départ" },
  { value: "destination", label: "Destination", description: "Aller simple" },
  { value: "round_trip", label: "Aller-retour", description: "Retour différent" },
];

const RIDE_STYLES = RIDE_STYLE_OPTIONS.filter(
  (option): option is typeof option & { style: RideStyle; supported: true } =>
    option.supported && option.style !== undefined,
);

const GENERATION_UNAVAILABLE: RideGenerationError = {
  code: "PROVIDER_ERROR",
  message:
    "Le service de cartographie ne répond pas. Réessayez dans quelques instants.",
  suggestions: ["Réessayez dans quelques instants."],
};

function errorMap(
  errors: RideFormError[],
): Partial<Record<RideFormField, string>> {
  const mapped: Partial<Record<RideFormField, string>> = {};
  for (const error of errors) {
    mapped[error.field] ??= error.message;
  }
  return mapped;
}

export type DescribeRidePanelProps = {
  searchPlaces?: (query: string, signal?: AbortSignal) => Promise<Place[]>;
  debounceMs?: number;
  generateRide?: (
    request: GenerateRideRequest,
    options?: GenerateRideClientOptions,
  ) => Promise<GenerateRideResult>;
  regenerateRide?: typeof requestRegeneratedRide;
  requestCoordinates?: () => Promise<Coordinates>;
  reversePlace?: (coordinates: Coordinates) => Promise<Place>;
  gpsPlace?: Place | null;
  onRequestComposed: (request: GenerateRideRequest) => void;
  onGeneratedRouteChange: (route: GeneratedRideRoute) => void;
  onStartNavigation: (options?: { muted?: boolean }) => void;
  onBack: () => void;
};

export function DescribeRidePanel({
  searchPlaces = searchPlacesFromApi,
  debounceMs = 250,
  generateRide = requestGeneratedRide,
  regenerateRide = requestRegeneratedRide,
  requestCoordinates,
  reversePlace,
  gpsPlace = null,
  onRequestComposed,
  onGeneratedRouteChange,
  onStartNavigation,
  onBack,
}: DescribeRidePanelProps) {
  const [describeText, setDescribeText] = useState("");
  const [draft, setDraft] = useState<NaturalLanguageRideDraft>(() =>
    parseNaturalLanguageRide(""),
  );
  const [startQuery, setStartQuery] = useState(gpsPlace?.label ?? "");
  const [start, setStart] = useState<Place | null>(gpsPlace);
  const [destinationQuery, setDestinationQuery] = useState("");
  const [destination, setDestination] = useState<Place | null>(null);
  const [composedRequest, setComposedRequest] =
    useState<GenerateRideRequest | null>(null);
  const [displayedRoute, setDisplayedRoute] =
    useState<GeneratedRideRoute | null>(null);
  const [editing, setEditing] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<RideFormField, string>>
  >({});
  const [generationError, setGenerationError] =
    useState<RideGenerationError | null>(null);
  const [startWarning, setStartWarning] = useState<string | null>(null);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const generationId = useRef(0);
  const inFlightRef = useRef(false);
  const retryActionRef = useRef<"continue" | "regenerate">("continue");
  const startRef = useRef(start);
  const busy = generating || regenerating;

  useEffect(() => {
    startRef.current = start;
  }, [start]);

  const needsDestination = draft.type !== "loop";
  const activeRoute = displayedRoute;
  const showComposer = editing || !activeRoute;

  function applyParsedDraft(next: NaturalLanguageRideDraft) {
    if (next.startQuery !== draft.startQuery) {
      setStartQuery(next.startQuery ?? "");
      setStart(null);
    }
    if (next.destinationQuery !== draft.destinationQuery) {
      setDestinationQuery(next.destinationQuery ?? "");
      setDestination(null);
    }
    setDraft(next);
  }

  async function handleContinue() {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    const requestId = generationId.current + 1;
    generationId.current = requestId;
    setGenerating(true);
    setGenerationError(null);
    setFieldErrors({});
    try {
      const composed = await composeDescribedRide({
        draft,
        start,
        destination,
        fallbackStart: gpsPlace,
        searchPlaces,
      });
      if (generationId.current !== requestId) {
        return;
      }
      if (!composed.ok) {
        setFieldErrors(errorMap(composed.errors));
        return;
      }
      if (composed.request.start) {
        setStart(composed.request.start);
        setStartQuery(composed.request.start.label);
      }
      if (composed.request.type !== "loop") {
        setDestination(composed.request.destination);
        setDestinationQuery(composed.request.destination.label);
      }
      const generated = await generateRide(composed.request);
      if (generationId.current !== requestId) {
        return;
      }
      if (generated.ok) {
        setComposedRequest(composed.request);
        onRequestComposed(composed.request);
        setDisplayedRoute(generated.route);
        onGeneratedRouteChange(generated.route);
        setEditing(false);
        return;
      }
      retryActionRef.current = "continue";
      setGenerationError(generated.error);
    } catch {
      if (generationId.current !== requestId) {
        return;
      }
      retryActionRef.current = "continue";
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
      const generated = await regenerateRide(composedRequest, activeRoute);
      if (generationId.current !== requestId) {
        return;
      }
      if (generated.ok) {
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
    void handleContinue();
  }

  return (
    <div aria-busy={busy}>
      {showComposer ? (
        <>
          <Label htmlFor="describe-ride">Votre demande</Label>
          <Textarea
            id="describe-ride"
            className="mt-2 min-h-28 text-base"
            placeholder="Crée une boucle de 250 km au départ de Granby, avec des routes sinueuses, sans autoroute et uniquement asphaltées."
            value={describeText}
            disabled={busy}
            onChange={(event) => {
              const value = event.target.value;
              setDescribeText(value);
              applyParsedDraft(parseNaturalLanguageRide(value));
            }}
          />
          <p className="mt-2 text-sm text-muted-foreground">
            L’IA ne trace pas la route : ces critères seront calculés par le
            moteur de routage.
          </p>
          {draft.unsupported.map((warning) => (
            <p key={warning} className="mt-1 text-sm text-muted-foreground">
              {warning}
            </p>
          ))}

          <fieldset className="mt-4 space-y-2">
            <legend className="text-sm font-medium">Type de trajet</legend>
            <div
              role="radiogroup"
              aria-label="Type de trajet"
              className="grid grid-cols-1 gap-2"
            >
              {RIDE_TYPES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={draft.type === option.value}
                  disabled={busy}
                  className={cn(
                    "flex min-h-12 flex-col items-start justify-center rounded-lg border px-3 py-2 text-left",
                    draft.type === option.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background",
                  )}
                  onClick={() =>
                    setDraft((current) => ({ ...current, type: option.value }))
                  }
                >
                  <span className="text-base font-medium">{option.label}</span>
                  <span
                    className={cn(
                      "text-sm",
                      draft.type === option.value
                        ? "text-primary-foreground/80"
                        : "text-muted-foreground",
                    )}
                  >
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mt-4">
            <PlaceSearchField
              id="describe-start"
              label="Point de départ"
              query={startQuery}
              selectedPlace={start}
              error={fieldErrors.start}
              placeholder="Rechercher un lieu"
              debounceMs={debounceMs}
              searchPlaces={searchPlaces}
              onQueryChange={(query) => {
                setStartQuery(query);
                setStart((current) =>
                  current && current.label === query ? current : null,
                );
                setFieldErrors((current) => ({ ...current, start: undefined }));
                setStartWarning(null);
                setDraft((current) => ({
                  ...current,
                  startQuery: query.trim() || null,
                }));
              }}
              onPlaceSelected={(place) => {
                setStart(place);
                setStartQuery(place.label);
                setFieldErrors((current) => ({ ...current, start: undefined }));
                setStartWarning(null);
                setDraft((current) => ({
                  ...current,
                  startQuery: place.label,
                }));
              }}
              action={
                <LocateButton
                  requestCoordinates={requestCoordinates}
                  reversePlace={reversePlace}
                  onLocated={(place, warning) => {
                    setStart(place);
                    setStartQuery(place.label);
                    setFieldErrors((current) => ({
                      ...current,
                      start: undefined,
                    }));
                    setStartWarning(warning ?? null);
                    setDraft((current) => ({
                      ...current,
                      startQuery: place.label,
                    }));
                  }}
                  onError={(message) => {
                    if (startRef.current) {
                      setStartWarning(message);
                      setFieldErrors((current) => ({
                        ...current,
                        start: undefined,
                      }));
                      return;
                    }
                    setFieldErrors((current) => ({
                      ...current,
                      start: message,
                    }));
                    setStartWarning(null);
                  }}
                />
              }
            />
            {startWarning ? (
              <p role="status" className="mt-2 text-sm text-muted-foreground">
                {startWarning}
              </p>
            ) : null}
          </div>

          {needsDestination ? (
            <div className="mt-4">
              <PlaceSearchField
                id="describe-destination"
                label="Destination"
                query={destinationQuery}
                selectedPlace={destination}
                error={fieldErrors.destination}
                placeholder="Rechercher une destination"
                debounceMs={debounceMs}
                searchPlaces={searchPlaces}
                onQueryChange={(query) => {
                  setDestinationQuery(query);
                  setDestination((current) =>
                    current && current.label === query ? current : null,
                  );
                  setFieldErrors((current) => ({
                    ...current,
                    destination: undefined,
                  }));
                  setDraft((current) => ({
                    ...current,
                    destinationQuery: query.trim() || null,
                  }));
                }}
                onPlaceSelected={(place) => {
                  setDestination(place);
                  setDestinationQuery(place.label);
                  setFieldErrors((current) => ({
                    ...current,
                    destination: undefined,
                  }));
                  setDraft((current) => ({
                    ...current,
                    destinationQuery: place.label,
                  }));
                }}
              />
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="describe-distance">Distance cible (km)</Label>
              <Input
                id="describe-distance"
                inputMode="decimal"
                className="h-12 text-base"
                value={
                  draft.targetDistanceKm === null
                    ? ""
                    : String(draft.targetDistanceKm)
                }
                aria-invalid={fieldErrors.targetDistanceKm ? true : undefined}
                disabled={busy}
                onChange={(event) => {
                  const raw = event.target.value.trim().replace(",", ".");
                  const value = raw === "" ? null : Number(raw);
                  setDraft((current) => ({
                    ...current,
                    targetDistanceKm:
                      value !== null && Number.isFinite(value) ? value : null,
                  }));
                  setFieldErrors((current) => ({
                    ...current,
                    targetDistanceKm: undefined,
                  }));
                }}
              />
              {fieldErrors.targetDistanceKm ? (
                <p className="text-sm text-destructive">
                  {fieldErrors.targetDistanceKm}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="describe-duration">Durée disponible (h)</Label>
              <Input
                id="describe-duration"
                inputMode="decimal"
                className="h-12 text-base"
                value={
                  draft.availableDurationHours === null
                    ? ""
                    : String(draft.availableDurationHours)
                }
                disabled={busy}
                onChange={(event) => {
                  const raw = event.target.value.trim().replace(",", ".");
                  const value = raw === "" ? null : Number(raw);
                  setDraft((current) => ({
                    ...current,
                    availableDurationHours:
                      value !== null && Number.isFinite(value) ? value : null,
                  }));
                }}
              />
            </div>
          </div>

          <fieldset className="mt-4 space-y-2">
            <legend className="text-sm font-medium">Style de trajet</legend>
            <div
              role="radiogroup"
              aria-label="Style de trajet"
              className="grid grid-cols-1 gap-2 sm:grid-cols-3"
            >
              {RIDE_STYLES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={draft.style === option.style}
                  disabled={busy}
                  className={cn(
                    "flex min-h-12 items-center justify-center rounded-lg border px-2 text-sm font-medium sm:text-base",
                    draft.style === option.style
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background",
                  )}
                  onClick={() =>
                    setDraft((current) => ({ ...current, style: option.style }))
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mt-4 space-y-2">
            <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border px-3">
              <Label htmlFor="describe-avoid-highways" className="text-base">
                Éviter les autoroutes
              </Label>
              <Switch
                id="describe-avoid-highways"
                checked={draft.preferences.avoidHighways}
                disabled={busy}
                onCheckedChange={(checked) =>
                  setDraft((current) => ({
                    ...current,
                    preferences: {
                      ...current.preferences,
                      avoidHighways: checked,
                    },
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
                checked={draft.preferences.avoidUnpaved}
                disabled={busy}
                onCheckedChange={(checked) =>
                  setDraft((current) => ({
                    ...current,
                    preferences: {
                      ...current.preferences,
                      avoidUnpaved: checked,
                    },
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
                checked={Boolean(draft.preferences.stayInCanada)}
                disabled={busy}
                onCheckedChange={(checked) =>
                  setDraft((current) => ({
                    ...current,
                    preferences: {
                      ...current.preferences,
                      stayInCanada: checked,
                    },
                  }))
                }
              />
            </div>
          </div>

          <Button
            type="button"
            size="lg"
            className="mt-4 min-h-12 w-full text-base"
            disabled={busy}
            aria-busy={generating}
            onClick={() => void handleContinue()}
          >
            {generating ? "Génération…" : "Continuer avec ces critères"}
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="min-h-12 w-full text-base"
          disabled={busy}
          onClick={() => setEditing(true)}
        >
          Modifier les critères
        </Button>
      )}

      {composedRequest ? (
        <p role="status" className="mt-3 text-sm leading-6 text-muted-foreground">
          {summarizeRideRequest(composedRequest)}
        </p>
      ) : null}

      {busy ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {regenerating
            ? "Régénération du trajet…"
            : "Génération du trajet…"}
        </p>
      ) : null}

      {activeRoute ? (
        <section aria-label="Trajet généré" className="mt-4 space-y-3">
          <h2 className="text-base font-medium">Avant le départ</h2>
          <p className="text-sm leading-6">
            {activeRoute.type === "loop"
              ? activeRoute.start.label
              : activeRoute.destination.label}
          </p>
          <p className="text-sm leading-6">
            {formatDistanceLabel(activeRoute.distanceKm)} ·{" "}
            {formatDurationLabel(activeRoute.durationMinutes)} ·{" "}
            {RIDE_TYPE_LABELS[activeRoute.type]} ·{" "}
            {RIDE_STYLE_LABELS[activeRoute.style ?? draft.style]}
          </p>
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-sm leading-6">
              GPS :{" "}
              {start
                ? `position définie (${start.label}).`
                : "non confirmé — utilisez Ma position."}
            </p>
            <LocateButton
              requestCoordinates={requestCoordinates}
              reversePlace={reversePlace}
              onLocated={(place, warning) => {
                setStart(place);
                setStartQuery(place.label);
                setStartWarning(warning ?? null);
                setFieldErrors((current) => ({ ...current, start: undefined }));
              }}
              onError={(message) => {
                setStartWarning(message);
              }}
            />
          </div>
          {startWarning ? (
            <p role="status" className="text-sm text-muted-foreground">
              {startWarning}
            </p>
          ) : null}
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
          activeRoute ? "pb-[max(0.25rem,env(safe-area-inset-bottom))]" : "border-t-0",
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
              {regenerating ? "Régénération…" : "Régénérer"}
            </Button>
          </>
        ) : null}
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
