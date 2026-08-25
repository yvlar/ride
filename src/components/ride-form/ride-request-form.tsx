"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createForegroundLocationWatch } from "@/infrastructure/location/create-foreground-location-watch";
import { createSpeechGuidance } from "@/infrastructure/voice/speech-guidance";
import { composeRideRequest } from "@/domain/ride/compose-request";
import {
  AVAILABLE_DURATION_HINT,
  hoursToMinutes,
} from "@/domain/ride/duration";
import { summarizeRideRequest } from "@/domain/ride/summarize-request";
import {
  isTargetDistanceRequired,
  targetDistanceHint,
} from "@/domain/ride/target-distance";
import type { Coordinates, Place } from "@/domain/geo/types";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  LocateButton,
  PlaceSearchField,
} from "@/components/ride-form/place-search-field";
import type { MapEngine } from "@/components/map/map-engine";
import { RideMap } from "@/components/map/ride-map";
import {
  NavigationSession,
  type NavigationSessionProps,
} from "@/components/navigation/navigation-session";
import {
  requestGeneratedRide,
  type GenerateRideClientOptions,
} from "@/components/ride-form/request-generated-ride";
import { requestRegeneratedRide } from "@/components/ride-form/request-regenerated-ride";
import { cn } from "@/lib/utils";
import { RIDE_STYLE_OPTIONS } from "@/domain/ride/style-catalog";
import { ROUTE_PREFERENCE_SUPPORT } from "@/domain/ride/preference-support";
import {
  principalRoadNames,
  routeShareSummary,
} from "@/domain/ride/route-share";
import { RIDE_TYPE_LABELS, RIDE_STYLE_LABELS } from "@/domain/ride/summarize-request";
import type { NaturalLanguageRideDraft } from "@/domain/ride/parse-natural-language";

const RIDE_TYPES: { value: RideType; label: string; description: string }[] = [
  {
    value: "loop",
    label: "Boucle",
    description: "Revenir au départ",
  },
  {
    value: "destination",
    label: "Destination",
    description: "Aller simple",
  },
  {
    value: "round_trip",
    label: "Aller-retour",
    description: "Retour différent",
  },
];

const RIDE_STYLES = RIDE_STYLE_OPTIONS.filter(
  (option): option is typeof option & { style: RideStyle; supported: true } =>
    option.supported && option.style !== undefined,
);

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (trimmed === "") {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : Number.NaN;
}

function errorMap(errors: RideFormError[]): Partial<Record<RideFormField, string>> {
  const mapped: Partial<Record<RideFormField, string>> = {};
  for (const error of errors) {
    mapped[error.field] ??= error.message;
  }
  return mapped;
}

function formatGeneratedDistanceKm(distanceKm: number): string {
  return `${distanceKm.toFixed(1)} km`;
}

function formatGeneratedDuration(durationMinutes: number): string {
  return `${Math.round(durationMinutes)} min`;
}

const GENERATION_UNAVAILABLE: RideGenerationError = {
  code: "PROVIDER_ERROR",
  message:
    "Le service de cartographie ne répond pas. Réessayez dans quelques instants.",
  suggestions: ["Réessayez dans quelques instants."],
};

export type RideRequestFormProps = {
  searchPlaces?: (query: string, signal?: AbortSignal) => Promise<Place[]>;
  debounceMs?: number;
  onRequestComposed?: (request: GenerateRideRequest) => void;
  generateRide?: (
    request: GenerateRideRequest,
    options?: GenerateRideClientOptions,
  ) => Promise<GenerateRideResult>;
  mapEngine?: MapEngine;
  requestCoordinates?: () => Promise<Coordinates>;
  reversePlace?: (coordinates: Coordinates) => Promise<Place>;
  navigation?: Partial<
    Pick<
      NavigationSessionProps,
      "locationWatch" | "speech" | "recalculate" | "mapEngine" | "now"
    >
  >;
  hideMap?: boolean;
  chrome?: "card" | "plain";
  initialType?: RideType;
  initialDestination?: Place | null;
  onGeneratedRouteChange?: (route: GeneratedRideRoute | null) => void;
  onNavigatingChange?: (navigating: boolean) => void;
  onSaveRide?: (route: GeneratedRideRoute, request: GenerateRideRequest) => void;
  regenerateRide?: typeof requestRegeneratedRide;
  seed?: {
    request: GenerateRideRequest;
    route: GeneratedRideRoute;
    autoStart?: boolean;
  } | null;
  initialStart?: Place | null;
  initialDraft?: NaturalLanguageRideDraft | null;
  initialMuted?: boolean;
  initialUseKnowledgeRouting?: boolean;
  onVoiceMutedChange?: (muted: boolean) => void;
  onKnowledgeRoutingChange?: (enabled: boolean) => void;
};

export function RideRequestForm({
  searchPlaces,
  debounceMs = 250,
  onRequestComposed,
  generateRide = requestGeneratedRide,
  mapEngine,
  requestCoordinates,
  reversePlace,
  navigation,
  hideMap = false,
  chrome = "card",
  initialType = "loop",
  initialDestination = null,
  onGeneratedRouteChange,
  onNavigatingChange,
  onSaveRide,
  regenerateRide = requestRegeneratedRide,
  seed = null,
  initialStart = null,
  initialDraft = null,
  initialMuted = false,
  initialUseKnowledgeRouting = false,
  onVoiceMutedChange,
  onKnowledgeRoutingChange,
}: RideRequestFormProps) {
  const [startQuery, setStartQuery] = useState(
    seed?.request.start.label ??
      initialStart?.label ??
      initialDraft?.startQuery ??
      "",
  );
  const [start, setStart] = useState<Place | null>(
    seed?.request.start ?? (initialDraft?.startQuery ? null : initialStart),
  );
  const [destinationQuery, setDestinationQuery] = useState(
    seed && seed.request.type !== "loop"
      ? seed.request.destination.label
      : (initialDestination?.label ?? initialDraft?.destinationQuery ?? ""),
  );
  const [destination, setDestination] = useState<Place | null>(
    seed && seed.request.type !== "loop"
      ? seed.request.destination
      : initialDestination,
  );
  const [type, setType] = useState<RideType>(
    seed?.request.type ?? initialDraft?.type ?? initialType,
  );
  const [targetDistanceKm, setTargetDistanceKm] = useState(
    seed?.request.targetDistanceKm
      ? String(seed.request.targetDistanceKm)
      : initialDraft?.targetDistanceKm
        ? String(initialDraft.targetDistanceKm)
        : "",
  );
  const [availableDurationHours, setAvailableDurationHours] = useState(
    initialDraft?.availableDurationHours
      ? String(initialDraft.availableDurationHours)
      : "",
  );
  const [style, setStyle] = useState<RideStyle>(
    seed?.request.style ?? initialDraft?.style ?? "scenic",
  );
  const [avoidHighways, setAvoidHighways] = useState(
    seed?.request.preferences?.avoidHighways ??
      initialDraft?.preferences.avoidHighways ??
      false,
  );
  const [avoidUnpaved, setAvoidUnpaved] = useState(
    seed?.request.preferences?.avoidUnpaved ??
      initialDraft?.preferences.avoidUnpaved ??
      false,
  );
  const [stayInCanada, setStayInCanada] = useState(
    seed?.request.preferences?.stayInCanada ??
      initialDraft?.preferences.stayInCanada ??
      false,
  );
  const [useKnowledgeRouting, setUseKnowledgeRouting] = useState(
    initialUseKnowledgeRouting,
  );
  const [voiceMuted, setVoiceMuted] = useState(initialMuted);
  const [regenerating, setRegenerating] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<RideFormField, string>>>(
    {},
  );
  const [status, setStatus] = useState<string | null>(
    seed ? summarizeRideRequest(seed.request) : null,
  );
  const [generating, setGenerating] = useState(false);
  const [generatedRoute, setGeneratedRoute] =
    useState<GeneratedRideRoute | null>(seed?.route ?? null);
  const [generationError, setGenerationError] =
    useState<RideGenerationError | null>(null);
  const [startWarning, setStartWarning] = useState<string | null>(null);
  const [composedRequest, setComposedRequest] =
    useState<GenerateRideRequest | null>(seed?.request ?? null);
  const [navigating, setNavigating] = useState(() => Boolean(seed?.autoStart));
  const [editingRequest, setEditingRequest] = useState(() => !seed);
  const [navUserLocation, setNavUserLocation] = useState<Coordinates | null>(
    null,
  );
  const [navHeadingDeg, setNavHeadingDeg] = useState<number | null>(null);
  const mapRecenterRef = useRef<() => void>(() => {});
  const mapOverviewRef = useRef<() => void>(() => {});
  const setMapGeolocateEnabledRef = useRef<(enabled: boolean) => void>(
    () => {},
  );
  const generationId = useRef(0);
  const startRef = useRef(start);
  const onGeneratedRouteChangeRef = useRef(onGeneratedRouteChange);
  const onNavigatingChangeRef = useRef(onNavigatingChange);
  const ownedLocationWatch = useMemo(() => createForegroundLocationWatch(), []);
  const ownedSpeech = useMemo(() => createSpeechGuidance(), []);
  const locationWatch = navigation?.locationWatch ?? ownedLocationWatch;
  const speechEngine = navigation?.speech ?? ownedSpeech;
  const showComposer = editingRequest || !generatedRoute;

  useEffect(() => {
    startRef.current = start;
  }, [start]);

  useEffect(() => {
    onGeneratedRouteChangeRef.current = onGeneratedRouteChange;
    onNavigatingChangeRef.current = onNavigatingChange;
  }, [onGeneratedRouteChange, onNavigatingChange]);

  useEffect(() => {
    if (seed) {
      onGeneratedRouteChangeRef.current?.(seed.route);
    }
    if (!seed?.autoStart) {
      return;
    }
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
    onNavigatingChangeRef.current?.(true);
  }, [seed, locationWatch, speechEngine]);

  function invalidateInFlightGeneration() {
    generationId.current += 1;
    setGenerating(false);
    setGeneratedRoute(null);
    setGenerationError(null);
    setNavigating(false);
    setNavUserLocation(null);
    setNavHeadingDeg(null);
    setComposedRequest(null);
    setEditingRequest(true);
    onGeneratedRouteChange?.(null);
    onNavigatingChange?.(false);
  }

  function startNavigation() {
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
    setNavigating(true);
    onNavigatingChange?.(true);
  }

  const needsDestination = type !== "loop";
  const durationHoursValue = parseOptionalNumber(availableDurationHours);
  const hasAvailableDuration =
    typeof durationHoursValue === "number" &&
    Number.isFinite(durationHoursValue) &&
    durationHoursValue > 0;
  const distanceRequired = isTargetDistanceRequired(type, hasAvailableDuration);
  const distanceHint = targetDistanceHint(type, hasAvailableDuration);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (generating) {
      return;
    }
    setStatus(null);
    setGeneratedRoute(null);
    setGenerationError(null);

    const durationHours = parseOptionalNumber(availableDurationHours);
    const result = composeRideRequest({
      start,
      type,
      destination: needsDestination ? destination : null,
      targetDistanceKm: parseOptionalNumber(targetDistanceKm),
      availableDurationMinutes:
        durationHours === null ? null : hoursToMinutes(durationHours),
      style,
      preferences: {
        avoidHighways,
        avoidUnpaved,
        stayInCanada,
      },
    });

    if (!result.ok) {
      setErrors(errorMap(result.errors));
      return;
    }

    setErrors({});
    setComposedRequest(result.request);
    setStatus(summarizeRideRequest(result.request));
    onRequestComposed?.(result.request);
    const requestId = generationId.current + 1;
    generationId.current = requestId;
    setGenerating(true);

    try {
      const generated = await generateRide(result.request, {
        useKnowledgeRouting,
      });
      if (generationId.current !== requestId) {
        return;
      }
      if (generated.ok) {
        setGeneratedRoute(generated.route);
        setEditingRequest(false);
        onGeneratedRouteChange?.(generated.route);
        return;
      }
      setGenerationError(generated.error);
    } catch {
      if (generationId.current !== requestId) {
        return;
      }
      setGenerationError(GENERATION_UNAVAILABLE);
    } finally {
      if (generationId.current === requestId) {
        setGenerating(false);
      }
    }
  }

  async function handleRegenerate() {
    if (!composedRequest || !generatedRoute || generating || regenerating) {
      return;
    }
    const requestId = generationId.current + 1;
    generationId.current = requestId;
    setRegenerating(true);
    setGenerationError(null);
    try {
      const generated = await regenerateRide(composedRequest, generatedRoute, {
        useKnowledgeRouting,
      });
      if (generationId.current !== requestId) {
        return;
      }
      if (generated.ok) {
        setGeneratedRoute(generated.route);
        onGeneratedRouteChange?.(generated.route);
        return;
      }
      setGenerationError(generated.error);
    } catch {
      if (generationId.current !== requestId) {
        return;
      }
      setGenerationError(GENERATION_UNAVAILABLE);
    } finally {
      if (generationId.current === requestId) {
        setRegenerating(false);
      }
    }
  }

  const form = (
    <>
        <form
          className="flex flex-col gap-6"
          onSubmit={handleSubmit}
          inert={navigating}
        >
          {showComposer ? (
            <>
          <PlaceSearchField
            id="start"
            label="Point de départ"
            query={startQuery}
            selectedPlace={start}
            error={errors.start}
            placeholder="Rechercher un lieu"
            debounceMs={debounceMs}
            searchPlaces={searchPlaces}
            onQueryChange={(query) => {
              setStartQuery(query);
              setStart((current) =>
                current && current.label === query ? current : null,
              );
              setErrors((current) => ({ ...current, start: undefined }));
              setStartWarning(null);
              invalidateInFlightGeneration();
            }}
            onPlaceSelected={(place) => {
              setStart(place);
              setStartQuery(place.label);
              setErrors((current) => ({ ...current, start: undefined }));
              setStartWarning(null);
              invalidateInFlightGeneration();
            }}
            action={
              <LocateButton
                requestCoordinates={requestCoordinates}
                reversePlace={reversePlace}
                onLocated={(place, warning) => {
                  setStart(place);
                  setStartQuery(place.label);
                  setErrors((current) => ({ ...current, start: undefined }));
                  setStartWarning(warning ?? null);
                  invalidateInFlightGeneration();
                }}
                onError={(message) => {
                  if (startRef.current) {
                    setStartWarning(message);
                    setErrors((current) => ({
                      ...current,
                      start: undefined,
                    }));
                    return;
                  }
                  setErrors((current) => ({ ...current, start: message }));
                  setStartWarning(null);
                }}
              />
            }
          />
          {startWarning ? (
            <p role="status" className="text-sm leading-6 text-muted-foreground">
              {startWarning}
            </p>
          ) : null}

          <fieldset className="space-y-2">
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
                  aria-checked={type === option.value}
                  className={cn(
                    "flex min-h-12 flex-col items-start justify-center rounded-lg border px-3 py-2 text-left transition-colors",
                    type === option.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted",
                  )}
                  onClick={() => {
                    setType(option.value);
                    setErrors((current) => ({
                      ...current,
                      type: undefined,
                      destination: undefined,
                      targetDistanceKm: undefined,
                    }));
                    setStatus(null);
                    invalidateInFlightGeneration();
                  }}
                >
                  <span className="text-base font-medium">{option.label}</span>
                  <span
                    className={cn(
                      "text-sm",
                      type === option.value
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

          {needsDestination ? (
            <PlaceSearchField
              id="destination"
              label="Destination"
              query={destinationQuery}
              selectedPlace={destination}
              error={errors.destination}
              placeholder="Rechercher une destination"
              debounceMs={debounceMs}
              searchPlaces={searchPlaces}
              onQueryChange={(query) => {
                setDestinationQuery(query);
                setDestination((current) =>
                  current && current.label === query ? current : null,
                );
                setErrors((current) => ({
                  ...current,
                  destination: undefined,
                }));
                invalidateInFlightGeneration();
              }}
              onPlaceSelected={(place) => {
                setDestination(place);
                setDestinationQuery(place.label);
                setErrors((current) => ({
                  ...current,
                  destination: undefined,
                }));
                invalidateInFlightGeneration();
              }}
            />
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="target-distance">
                Distance cible (km)
                {distanceRequired ? (
                  <span aria-hidden="true"> *</span>
                ) : null}
              </Label>
              <Input
                id="target-distance"
                inputMode="decimal"
                placeholder="ex. 200"
                value={targetDistanceKm}
                aria-required={distanceRequired}
                aria-invalid={errors.targetDistanceKm ? true : undefined}
                aria-describedby={
                  errors.targetDistanceKm
                    ? "target-distance-hint target-distance-error"
                    : "target-distance-hint"
                }
                onChange={(event) => {
                  setTargetDistanceKm(event.target.value);
                  setErrors((current) => ({
                    ...current,
                    targetDistanceKm: undefined,
                  }));
                  invalidateInFlightGeneration();
                }}
                className="h-12 text-base"
              />
              <p id="target-distance-hint" className="text-sm text-muted-foreground">
                {distanceHint}
              </p>
              {errors.targetDistanceKm ? (
                <p
                  id="target-distance-error"
                  className="text-sm text-destructive"
                >
                  {errors.targetDistanceKm}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="available-duration">Durée disponible (h)</Label>
              <Input
                id="available-duration"
                inputMode="decimal"
                placeholder="ex. 3"
                value={availableDurationHours}
                aria-invalid={
                  errors.availableDurationMinutes ? true : undefined
                }
                aria-describedby={
                  errors.availableDurationMinutes
                    ? "available-duration-hint available-duration-error"
                    : "available-duration-hint"
                }
                onChange={(event) => {
                  setAvailableDurationHours(event.target.value);
                  setErrors((current) => ({
                    ...current,
                    availableDurationMinutes: undefined,
                  }));
                  invalidateInFlightGeneration();
                }}
                className="h-12 text-base"
              />
              <p
                id="available-duration-hint"
                className="text-sm text-muted-foreground"
              >
                {AVAILABLE_DURATION_HINT}
              </p>
              {errors.availableDurationMinutes ? (
                <p
                  id="available-duration-error"
                  className="text-sm text-destructive"
                >
                  {errors.availableDurationMinutes}
                </p>
              ) : null}
            </div>
          </div>

          <fieldset className="space-y-2">
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
                  aria-checked={style === option.style}
                  className={cn(
                    "flex min-h-12 items-center justify-center rounded-lg border px-2 text-sm font-medium transition-colors sm:text-base",
                    style === option.style
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted",
                  )}
                  onClick={() => {
                    setStyle(option.style);
                    invalidateInFlightGeneration();
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {RIDE_STYLE_OPTIONS.filter((option) => !option.supported).map(
                (option) => (
                  <button
                    key={option.id}
                    type="button"
                    disabled
                    aria-disabled="true"
                    title={option.unsupportedReason}
                    className="flex min-h-12 flex-col items-start justify-center rounded-lg border border-dashed border-border px-3 py-2 text-left text-sm text-muted-foreground"
                  >
                    <span className="font-medium">{option.label}</span>
                    <span>{option.unsupportedReason}</span>
                  </button>
                ),
              )}
            </div>
          </fieldset>

          <div className="space-y-2">
            <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border px-3">
              <Label htmlFor="avoid-highways" className="text-base">
                Éviter les autoroutes
              </Label>
              <Switch
                id="avoid-highways"
                checked={avoidHighways}
                onCheckedChange={(checked) => {
                  setAvoidHighways(checked);
                  invalidateInFlightGeneration();
                }}
              />
            </div>
            <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border px-3">
              <Label htmlFor="avoid-unpaved" className="text-base">
                Éviter les routes non pavées
              </Label>
              <Switch
                id="avoid-unpaved"
                checked={avoidUnpaved}
                onCheckedChange={(checked) => {
                  setAvoidUnpaved(checked);
                  invalidateInFlightGeneration();
                }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Route asphaltée seulement lorsque c’est activé.
            </p>
            <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border px-3">
              <Label htmlFor="allow-unpaved" className="text-base">
                Chemins non asphaltés autorisés
              </Label>
              <Switch
                id="allow-unpaved"
                checked={!avoidUnpaved}
                onCheckedChange={(checked) => {
                  setAvoidUnpaved(!checked);
                  invalidateInFlightGeneration();
                }}
              />
            </div>
            {ROUTE_PREFERENCE_SUPPORT.filter((item) => !item.supported).map(
              (item) => (
                <div
                  key={item.key}
                  className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-dashed border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-base text-muted-foreground">{item.label}</p>
                    <p className="text-sm text-muted-foreground">{item.explanation}</p>
                  </div>
                  <Switch
                    id={item.key}
                    checked={false}
                    disabled
                    aria-disabled="true"
                    aria-label={item.label}
                  />
                </div>
              ),
            )}
            <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <div className="min-w-0">
                <Label htmlFor="stay-in-canada" className="text-base">
                  Canada seulement
                </Label>
                <p id="stay-in-canada-hint" className="text-sm text-muted-foreground">
                  Ne pas traverser aux États-Unis
                </p>
              </div>
              <Switch
                id="stay-in-canada"
                checked={stayInCanada}
                aria-describedby="stay-in-canada-hint"
                onCheckedChange={(checked) => {
                  setStayInCanada(checked);
                  invalidateInFlightGeneration();
                }}
              />
            </div>
            <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <div className="min-w-0">
                <Label htmlFor="use-knowledge-routing" className="text-base">
                  Corridors RAG
                </Label>
                <p
                  id="use-knowledge-routing-hint"
                  className="text-sm text-muted-foreground"
                >
                  Classement des corridors par ChatGPT (clé API serveur). Le tracé
                  suit le réseau routier configuré.
                </p>
              </div>
              <Switch
                id="use-knowledge-routing"
                checked={useKnowledgeRouting}
                aria-describedby="use-knowledge-routing-hint"
                onCheckedChange={(checked) => {
                  setUseKnowledgeRouting(checked);
                  onKnowledgeRoutingChange?.(checked);
                  invalidateInFlightGeneration();
                }}
              />
            </div>
          </div>

          <Button
            type="submit"
            size="lg"
            className="min-h-12 w-full text-base"
            disabled={generating}
            aria-busy={generating}
          >
            {generating ? "Génération…" : "Générer ma ride"}
          </Button>
            </>
          ) : null}

          {generatedRoute && !showComposer ? (
            <Button
              type="button"
              variant="ghost"
              className="min-h-12 w-full text-base"
              onClick={() => setEditingRequest(true)}
            >
              Modifier la demande
            </Button>
          ) : null}

          {status ? (
            <p role="status" className="text-sm leading-6 text-muted-foreground">
              {status}
            </p>
          ) : null}

          {generatedRoute ? (
            <section
              aria-label="Trajet généré"
              className="space-y-3 rounded-lg border border-border px-3 py-3"
            >
              <h2 className="text-base font-medium">Avant le départ</h2>
              {!hideMap ? (
                <div className={navigating ? "fixed inset-0 z-40" : undefined}>
                  <RideMap
                    route={generatedRoute}
                    engine={mapEngine}
                    expanded={navigating}
                    userLocation={navigating ? navUserLocation : null}
                    headingDeg={navigating ? navHeadingDeg : null}
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
              <p className="text-sm leading-6">
                {generatedRoute.type === "loop"
                  ? generatedRoute.start.label
                  : generatedRoute.destination.label}
              </p>
              <p className="text-sm leading-6">
                {formatGeneratedDistanceKm(generatedRoute.distanceKm)} ·{" "}
                {formatGeneratedDuration(generatedRoute.durationMinutes)} ·{" "}
                {RIDE_TYPE_LABELS[generatedRoute.type]} ·{" "}
                {RIDE_STYLE_LABELS[generatedRoute.style ?? style]}
              </p>
              {(() => {
                const shares = routeShareSummary(generatedRoute.segments);
                const roads = principalRoadNames(generatedRoute.segments);
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
              {generatedRoute.warnings.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
                  {generatedRoute.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
              <p className="text-sm leading-6">
                GPS :{" "}
                {start
                  ? `position définie (${start.label}).`
                  : "non confirmé — utilisez Ma position."}{" "}
                Guidage vocal {voiceMuted ? "désactivé" : "activé"}.
              </p>
              {!start ? (
                <p role="status" className="text-sm text-destructive">
                  Indiquez un point de départ avant de rouler.
                </p>
              ) : null}
              <LocateButton
                requestCoordinates={requestCoordinates}
                reversePlace={reversePlace}
                onLocated={(place, warning) => {
                  setStart(place);
                  setStartQuery(place.label);
                  setErrors((current) => ({ ...current, start: undefined }));
                  setStartWarning(warning ?? null);
                }}
                onError={(message) => {
                  if (startRef.current) {
                    setStartWarning(message);
                    setErrors((current) => ({
                      ...current,
                      start: undefined,
                    }));
                    return;
                  }
                  setErrors((current) => ({ ...current, start: message }));
                  setStartWarning(null);
                }}
              />
              {startWarning ? (
                <p role="status" className="text-sm leading-6 text-muted-foreground">
                  {startWarning}
                </p>
              ) : null}
              <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border px-3">
                <Label htmlFor="voice-guidance" className="text-base">
                  Guidage vocal
                </Label>
                <Switch
                  id="voice-guidance"
                  checked={!voiceMuted}
                  onCheckedChange={(checked) => {
                    const next = !checked;
                    setVoiceMuted(next);
                    onVoiceMutedChange?.(next);
                  }}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="min-h-12 w-full text-base"
                disabled={regenerating || generating}
                onClick={() => void handleRegenerate()}
              >
                {regenerating ? "Nouvelle route…" : "Une autre route"}
              </Button>
              {onSaveRide && composedRequest ? (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="min-h-12 w-full text-base"
                  onClick={() => onSaveRide(generatedRoute, composedRequest)}
                >
                  Enregistrer
                </Button>
              ) : null}
              <Button
                type="button"
                size="lg"
                className="min-h-12 w-full text-base"
                aria-label="Démarrer la navigation"
                onClick={startNavigation}
              >
                Démarrer
              </Button>
            </section>
          ) : null}

          {generationError ? (
            <div role="alert" className="space-y-2 text-sm leading-6">
              <p className="text-destructive">{generationError.message}</p>
              {generationError.suggestions.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  {generationError.suggestions.map((suggestion) => (
                    <li key={suggestion}>{suggestion}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </form>
        {navigating && generatedRoute && composedRequest ? (
          <NavigationSession
            route={generatedRoute}
            request={composedRequest}
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
            onStop={() => {
              setNavigating(false);
              onNavigatingChange?.(false);
              setNavUserLocation(null);
              setNavHeadingDeg(null);
            }}
            onRouteChange={(route) => {
              setGeneratedRoute(route);
              onGeneratedRouteChange?.(route);
            }}
            locationWatch={locationWatch}
            speech={speechEngine}
            recalculate={navigation?.recalculate}
            now={navigation?.now}
            useKnowledgeRouting={useKnowledgeRouting}
            initialMuted={voiceMuted}
            onMutedChange={(muted) => {
              setVoiceMuted(muted);
              onVoiceMutedChange?.(muted);
            }}
          />
        ) : null}
    </>
  );

  if (chrome === "plain") {
    return form;
  }

  return (
    <Card className={navigating ? "overflow-visible" : undefined}>
      <CardHeader>
        <CardTitle>Composer la ride</CardTitle>
      </CardHeader>
      <CardContent>{form}</CardContent>
    </Card>
  );
}
