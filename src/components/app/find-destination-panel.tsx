"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { composeDestinationRide } from "@/application/compose-destination-ride";
import {
  formatDistanceLabel,
  formatDurationLabel,
  formatEta,
} from "@/components/navigation/format-navigation";
import { DestinationMapPicker } from "@/components/map/destination-map-picker";
import { PlaceSearchField } from "@/components/ride-form/place-search-field";
import { SelectedDestinationCard } from "@/components/ride-form/selected-destination-card";
import { searchPlacesFromApi } from "@/components/ride-form/search-places";
import {
  CurrentPositionError,
  type GeolocationFailureReason,
} from "@/components/ride-form/browser-geolocation";
import {
  isAbortError,
  requestGeneratedRide,
  type GenerateRideClientOptions,
} from "@/components/ride-form/request-generated-ride";
import { requestRegeneratedRide } from "@/components/ride-form/request-regenerated-ride";
import {
  currentPositionFallback,
  reverseGeocodePlace,
} from "@/components/ride-form/reverse-geocode-place";
import { Button } from "@/components/ui/button";
import {
  canGenerateDestinationSearch,
  canStartDestinationNavigation,
  createDestinationSearchState,
  reduceDestinationSearch,
} from "@/domain/destination-search/flow";
import type { MapEngine } from "@/components/map/map-engine";
import type { Coordinates, Place } from "@/domain/geo/types";
import type { LocatedPosition } from "@/domain/location/types";
import { previousRideSignature } from "@/domain/ride/route-signature";
import { principalRoadNames, routeShareSummary } from "@/domain/ride/route-share";
import { readStoredRoutePreferences } from "@/domain/ride/stored-route-preferences";
import { generatedRouteTypeLabel, RIDE_STYLE_LABELS } from "@/domain/ride/summarize-request";
import type {
  GenerateRideRequest,
  GenerateRideResult,
  GeneratedRideRoute,
  RideGenerationError,
} from "@/domain/ride/types";
import { requestDevicePosition } from "@/infrastructure/location/request-device-coordinates";
import { openDeviceLocationSettings } from "@/infrastructure/location/open-location-settings";
import { cn } from "@/lib/utils";

const GENERATION_UNAVAILABLE: RideGenerationError = {
  code: "PROVIDER_ERROR",
  message:
    "Le service de cartographie ne répond pas. Réessayez dans quelques instants.",
  suggestions: ["Réessayez."],
};

function locationStatusFromReason(
  reason: GeolocationFailureReason,
): "permission_denied" | "unavailable" {
  return reason === "permission_denied" ? "permission_denied" : "unavailable";
}

function locationStatusMessage(
  status: "locating" | "detected" | "permission_denied" | "unavailable",
): string {
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

export type FindDestinationPanelProps = {
  generateRide?: (
    request: GenerateRideRequest,
    options?: GenerateRideClientOptions,
  ) => Promise<GenerateRideResult>;
  regenerateRide?: typeof requestRegeneratedRide;
  requestPosition?: () => Promise<LocatedPosition>;
  reversePlace?: (coordinates: Coordinates) => Promise<Place>;
  searchPlaces?: (query: string, signal?: AbortSignal) => Promise<Place[]>;
  debounceMs?: number;
  /** Injected in tests; the picker mounts the real MapLibre engine otherwise. */
  mapEngine?: MapEngine;
  initialDestination?: Place | null;
  initialQuery?: string;
  navigationActive?: boolean;
  openLocationSettings?: () => boolean;
  /** Injected so the arrival time is deterministic under test. */
  now?: () => number;
  onDestinationChange?: (place: Place | null, query: string) => void;
  onRequestComposed: (request: GenerateRideRequest) => void;
  onGeneratedRouteChange: (route: GeneratedRideRoute) => void;
  onStartNavigation: (options?: { muted?: boolean }) => void;
  onBack: () => void;
};

export function FindDestinationPanel({
  generateRide = requestGeneratedRide,
  regenerateRide = requestRegeneratedRide,
  requestPosition = requestDevicePosition,
  reversePlace = reverseGeocodePlace,
  searchPlaces,
  debounceMs,
  mapEngine,
  initialDestination = null,
  initialQuery = "",
  navigationActive = false,
  openLocationSettings = openDeviceLocationSettings,
  now = Date.now,
  onDestinationChange,
  onRequestComposed,
  onGeneratedRouteChange,
  onStartNavigation,
  onBack,
}: FindDestinationPanelProps) {
  const [state, dispatch] = useReducer(
    reduceDestinationSearch,
    { destination: initialDestination, destinationQuery: initialQuery },
    createDestinationSearchState,
  );
  const locateGeneration = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const startRef = useRef(state.start);
  const destinationRef = useRef(state.destination);
  const previousNavigation = useRef(navigationActive);
  const onDestinationChangeRef = useRef(onDestinationChange);
  const inFlightRef = useRef(false);
  const startLockRef = useRef(false);
  const busy = state.phase === "generating" || state.phase === "cancelling";
  const preview = state.route;
  const canGenerate = canGenerateDestinationSearch(state);
  const canStart = canStartDestinationNavigation(state);
  const showDestinationCard =
    state.stage === "selected" && state.destination !== null;
  // Changing the destination mid-generation is allowed: it aborts the in-flight
  // request rather than waiting for it (FR-038). Only a cancellation in
  // progress freezes the controls.
  const destinationLocked =
    state.phase === "cancelling" || state.phase === "navigating";
  const proximity = state.start?.coordinates ?? null;
  // Proximity is bound here so the field never talks to the geocoder itself.
  const searchNearby = useCallback(
    (query: string, signal?: AbortSignal) =>
      searchPlaces
        ? searchPlaces(query, signal)
        : searchPlacesFromApi(query, signal, { proximity }),
    [searchPlaces, proximity],
  );

  useEffect(() => {
    startRef.current = state.start;
    destinationRef.current = state.destination;
  }, [state.start, state.destination]);

  useEffect(() => {
    onDestinationChangeRef.current = onDestinationChange;
  }, [onDestinationChange]);

  useEffect(() => {
    onDestinationChangeRef.current?.(state.destination, state.destinationQuery);
  }, [state.destination, state.destinationQuery]);

  async function resolveStart(coordinates: Coordinates): Promise<Place> {
    try {
      const place = await reversePlace(coordinates);
      return { ...place, coordinates };
    } catch {
      return currentPositionFallback(coordinates);
    }
  }

  async function locate(
    options: { silent?: boolean } = {},
  ): Promise<LocatedPosition | null> {
    const requestId = locateGeneration.current + 1;
    locateGeneration.current = requestId;
    if (!options.silent) {
      dispatch({ type: "locate_start" });
    }
    try {
      const located = await requestPosition();
      if (locateGeneration.current !== requestId) {
        return null;
      }
      const place = await resolveStart(located.coordinates);
      if (locateGeneration.current !== requestId) {
        return null;
      }
      startRef.current = place;
      dispatch({ type: "locate_success", start: place });
      return located;
    } catch (error) {
      if (locateGeneration.current !== requestId) {
        return null;
      }
      if (options.silent) {
        return null;
      }
      const reason =
        error instanceof CurrentPositionError ? error.reason : "unknown";
      dispatch({
        type: "locate_failure",
        reason: locationStatusFromReason(reason),
        message:
          error instanceof CurrentPositionError
            ? error.message
            : locationStatusMessage("unavailable"),
      });
      return null;
    }
  }

  useEffect(() => {
    void locate();
    return () => {
      abortRef.current?.abort();
      locateGeneration.current += 1;
    };
    // One-shot precise fix when the destination flow opens (FR-038).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only locate
  }, []);

  useEffect(() => {
    const wasNavigating = previousNavigation.current;
    previousNavigation.current = navigationActive;
    if (navigationActive && !wasNavigating) {
      dispatch({ type: "start_navigation" });
      return;
    }
    if (wasNavigating && !navigationActive) {
      abortRef.current?.abort();
      inFlightRef.current = false;
      startLockRef.current = false;
      dispatch({ type: "cancel_navigation" });
      dispatch({ type: "cancel_completed" });
      void locate();
    }
    // locate is stable for this pane lifetime (FR-038 cancel → refresh GPS).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigationActive]);

  /*
   * The start lock only has to survive two taps inside one commit. Releasing
   * it after every render means a host that declined to start navigation
   * (a session was already running) leaves the primary action usable.
   */
  useEffect(() => {
    if (!navigationActive && state.phase !== "navigating") {
      startLockRef.current = false;
    }
  });

  async function handleGenerate(mode: "generate" | "another") {
    if (
      inFlightRef.current ||
      state.phase === "navigating" ||
      state.phase === "cancelling" ||
      state.phase === "generating"
    ) {
      return;
    }
    if (!state.start || !state.destination) {
      return;
    }
    const previousRoute = state.route;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    inFlightRef.current = true;
    startLockRef.current = false;
    const requestId = state.generationId + 1;
    dispatch({ type: "generate_start" });
    try {
      const refreshed = await locate({ silent: true });
      if (controller.signal.aborted) {
        dispatch({ type: "generate_aborted", generationId: requestId });
        return;
      }
      const start = startRef.current;
      const destination = destinationRef.current;
      const located =
        refreshed ??
        (start
          ? { coordinates: start.coordinates, accuracyMeters: null }
          : null);
      if (!located || !start || !destination) {
        dispatch({
          type: "generate_failure",
          generationId: requestId,
          message: "La position actuelle est requise pour générer le trajet.",
          suggestions: ["Réessayer la localisation"],
        });
        return;
      }
      const preferences = readStoredRoutePreferences(
        typeof window === "undefined" ? null : window.localStorage,
      );
      const composed = composeDestinationRide({
        start,
        destination,
        preferences,
      });
      if (!composed.ok) {
        dispatch({
          type: "generate_failure",
          generationId: requestId,
          message: composed.errors[0]?.message ?? "La demande est invalide.",
          suggestions: ["Réessayez."],
        });
        return;
      }
      const options: GenerateRideClientOptions = {
        signal: controller.signal,
        originAccuracyMeters: located.accuracyMeters,
      };
      const generated =
        mode === "another" && previousRoute
          ? await regenerateRide(composed.request, previousRoute, {
              ...options,
              previousRouteSignature: previousRideSignature({
                id: previousRoute.id,
                geometry: previousRoute.geometry,
              }),
            })
          : await generateRide(composed.request, options);
      if (
        controller.signal.aborted ||
        (!generated.ok && generated.error.code === "STALE_RECALCULATE")
      ) {
        dispatch({ type: "generate_aborted", generationId: requestId });
        return;
      }
      if (generated.ok) {
        dispatch({
          type: "generate_success",
          generationId: requestId,
          route: generated.route,
          request: composed.request,
        });
        onRequestComposed(composed.request);
        onGeneratedRouteChange(generated.route);
        return;
      }
      dispatch({
        type: "generate_failure",
        generationId: requestId,
        message: generated.error.message,
        suggestions: generated.error.suggestions,
      });
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        dispatch({ type: "generate_aborted", generationId: requestId });
        return;
      }
      dispatch({
        type: "generate_failure",
        generationId: requestId,
        message: GENERATION_UNAVAILABLE.message,
        suggestions: GENERATION_UNAVAILABLE.suggestions,
      });
    } finally {
      if (abortRef.current === controller) {
        inFlightRef.current = false;
      }
    }
  }

  /**
   * FR-042 — a rider must be able to back out of a slow generation without
   * force-quitting. Aborting restores whatever preview was on screen before.
   */
  function handleCancelGeneration() {
    if (state.phase !== "generating") {
      return;
    }
    abortRef.current?.abort();
    abortRef.current = null;
    inFlightRef.current = false;
    locateGeneration.current += 1;
    dispatch({ type: "generate_aborted", generationId: state.generationId });
  }

  function handleStartNavigation() {
    if (
      startLockRef.current ||
      navigationActive ||
      !canStartDestinationNavigation(state)
    ) {
      return;
    }
    // The lock only debounces a double tap. The phase itself is driven by the
    // `navigationActive` prop below, so a host that declines to start (a
    // session is already running) leaves the button usable instead of
    // dead-ending on a phase the app never entered.
    startLockRef.current = true;
    abortRef.current?.abort();
    inFlightRef.current = false;
    onStartNavigation();
  }

  function handleOpenLocationSettings() {
    const opened = openLocationSettings();
    if (!opened) {
      void locate();
    }
  }

  return (
    <div
      aria-busy={busy}
      data-testid="destination-flow"
      data-destination-flow={state.phase}
      data-start-latitude={
        state.start ? String(state.start.coordinates.latitude) : undefined
      }
      data-start-longitude={
        state.start ? String(state.start.coordinates.longitude) : undefined
      }
    >
      <p role="status" className="text-sm text-muted-foreground">
        {locationStatusMessage(state.locationStatus)}
        {state.start && state.locationStatus === "detected"
          ? ` · ${state.start.label}`
          : ""}
      </p>
      {state.locationStatus === "permission_denied" ||
      state.locationStatus === "unavailable" ? (
        <div className="mt-2 grid gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-12 w-full text-base"
            disabled={busy}
            onClick={() => void locate()}
          >
            Réessayer la localisation
          </Button>
          {state.locationStatus === "permission_denied" ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-12 w-full text-base"
              disabled={busy}
              onClick={handleOpenLocationSettings}
            >
              Ouvrir les réglages de localisation
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4">
        {showDestinationCard && state.destination ? (
          <SelectedDestinationCard
            destination={state.destination}
            disabled={destinationLocked}
            onEdit={() => dispatch({ type: "edit_destination_text" })}
            onClear={() => {
              abortRef.current?.abort();
              inFlightRef.current = false;
              dispatch({ type: "clear_destination" });
            }}
            onAdjustOnMap={() => dispatch({ type: "open_map_picker" })}
          />
        ) : (
          <PlaceSearchField
            id="find-destination"
            label="Où voulez-vous aller?"
            query={state.destinationQuery}
            selectedPlace={state.destination}
            placeholder="Adresse, ville ou code postal"
            hint="Par exemple : 125 rue Principale, Granby · Roxton Pond · J2G 2W4"
            debounceMs={debounceMs}
            searchPlaces={searchNearby}
            footer={
              <Button
                type="button"
                variant="outline"
                className="min-h-12 w-full text-base"
                disabled={destinationLocked}
                onClick={() => dispatch({ type: "open_map_picker" })}
              >
                Choisir sur la carte
              </Button>
            }
            onQueryChange={(query) => {
              abortRef.current?.abort();
              inFlightRef.current = false;
              dispatch({ type: "change_destination_query", query });
            }}
            onPlaceSelected={(place) => {
              abortRef.current?.abort();
              inFlightRef.current = false;
              dispatch({
                type: "set_destination",
                destination: { ...place, source: place.source ?? "search" },
              });
            }}
          />
        )}
      </div>

      {state.mapPickerOpen ? (
        <DestinationMapPicker
          engine={mapEngine}
          userLocation={state.start?.coordinates ?? null}
          initialPoint={state.destination?.coordinates ?? null}
          reversePlace={reversePlace}
          onCancel={() => dispatch({ type: "cancel_map_picker" })}
          onConfirm={(destination) => {
            abortRef.current?.abort();
            inFlightRef.current = false;
            dispatch({ type: "confirm_map_pick", destination });
          }}
        />
      ) : null}

      {state.phase === "generating" ? (
        <div className="mt-4 space-y-2">
          <p role="status" className="text-sm text-muted-foreground">
            {preview
              ? "Génération d’un nouveau trajet… le trajet actuel reste affiché."
              : "Génération du trajet…"}
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

      {preview ? (
        <section aria-label="Trajet généré" className="mt-4 space-y-3">
          {/* Keep the target in view: it is what the rider is deciding about. */}
          {state.destination ? (
            <p className="truncate text-base font-medium leading-6">
              Vers {state.destination.label}
            </p>
          ) : null}
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div>
              <dd className="text-xl font-semibold leading-7 tabular-nums">
                {formatDistanceLabel(preview.distanceKm)}
              </dd>
              <dt className="text-xs leading-4 text-muted-foreground">distance</dt>
            </div>
            <div>
              <dd className="text-xl font-semibold leading-7 tabular-nums">
                {formatDurationLabel(preview.durationMinutes)}
              </dd>
              <dt className="text-xs leading-4 text-muted-foreground">durée</dt>
            </div>
            <div>
              <dd className="text-xl font-semibold leading-7 tabular-nums">
                {formatEta(now(), preview.durationMinutes)}
              </dd>
              <dt className="text-xs leading-4 text-muted-foreground">arrivée</dt>
            </div>
          </dl>
          <p className="text-sm leading-6 text-muted-foreground">
            {generatedRouteTypeLabel(preview.type)} ·{" "}
            {RIDE_STYLE_LABELS[preview.style ?? "scenic"]}
          </p>
          {(() => {
            const shares = routeShareSummary(preview.segments);
            const roads = principalRoadNames(preview.segments);
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
          {preview.warnings.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {preview.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {state.error ? (
        <div role="alert" className="mt-3 space-y-2 text-sm leading-6">
          <p className="text-destructive">{state.error.message}</p>
          {state.error.suggestions.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {state.error.suggestions.map((suggestion) => (
                <li key={suggestion}>{suggestion}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "sticky bottom-0 z-20 -mx-4 mt-3 space-y-2 border-t border-border bg-card px-4 pt-3",
          "pb-[max(0.25rem,env(safe-area-inset-bottom))]",
        )}
        role={preview ? "group" : undefined}
        aria-label={preview ? "Actions du trajet" : undefined}
      >
        {state.phase === "routePreview" && preview ? (
          <>
            <Button
              key="find-destination-start"
              type="button"
              size="lg"
              className="min-h-12 w-full text-base"
              disabled={busy || !canStart || navigationActive}
              aria-label="Démarrer la navigation"
              onClick={handleStartNavigation}
            >
              Démarrer la navigation
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                key="find-destination-another"
                type="button"
                variant="outline"
                size="lg"
                className="min-h-12 w-full text-base"
                disabled={busy || !canGenerate}
                onClick={() => void handleGenerate("another")}
              >
                Régénérer
              </Button>
              <Button
                key="find-destination-edit"
                type="button"
                variant="outline"
                size="lg"
                className="min-h-12 w-full text-base"
                disabled={busy}
                onClick={() => {
                  abortRef.current?.abort();
                  inFlightRef.current = false;
                  startLockRef.current = false;
                  dispatch({ type: "edit_destination" });
                }}
              >
                Modifier la destination
              </Button>
            </div>
          </>
        ) : (
          <Button
            key="find-destination-generate"
            type="button"
            size="lg"
            className="min-h-12 w-full text-base"
            disabled={!canGenerate}
            aria-busy={state.phase === "generating"}
            onClick={() => void handleGenerate("generate")}
          >
            {state.phase === "generating"
              ? "Génération du trajet…"
              : "Générer le trajet"}
          </Button>
        )}
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
