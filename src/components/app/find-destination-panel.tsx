"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { composeDestinationRide } from "@/application/compose-destination-ride";
import {
  formatDistanceLabel,
  formatDurationLabel,
  formatEta,
} from "@/components/navigation/format-navigation";
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
  MAP_PICK_REVERSE_PENDING_MESSAGE,
  reduceDestinationSearch,
  showsGenerateDestinationAction,
} from "@/domain/destination-search/flow";
import type { Coordinates, Place } from "@/domain/geo/types";
import type { LocatedPosition } from "@/domain/location/types";
import { previousRideSignature } from "@/domain/ride/route-signature";
import { principalRoadNames, routeShareSummary } from "@/domain/ride/route-share";
import {
  readStoredRoutePreferences,
  readStoredRouteStyle,
} from "@/domain/ride/stored-route-preferences";
import { generatedRouteTypeLabel, RIDE_STYLE_LABELS } from "@/domain/ride/summarize-request";
import type {
  GenerateRideRequest,
  GenerateRideResult,
  GeneratedRideRoute,
  RideGenerationError,
} from "@/domain/ride/types";
import { requestDevicePosition } from "@/infrastructure/location/request-device-coordinates";
import { openDeviceLocationSettings } from "@/infrastructure/location/open-location-settings";

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

/**
 * FR-038 — the explorer map sits right behind this pane, so picking a point is
 * offered alongside the text field rather than behind a button and a modal.
 */
export const MAP_PICK_HINT =
  "Ou placez la destination directement sur la carte : appui long (clic sur ordinateur), puis déplacez le marqueur.";

const PREVIEW_DETAILS_LABEL = "Détails du trajet";
const PREVIEW_DETAILS_HIDE_LABEL = "Masquer les détails";

/**
 * FR-038 — the preview floats over the trajet it describes, so it shows only
 * what the rider decides with: where they are going, and the three numbers.
 * Roads, shares and warnings are one tap away rather than covering the map,
 * and the label counts the warnings so none of them folds away unannounced.
 */
function previewDetailsLabel(warningCount: number): string {
  if (warningCount === 0) {
    return PREVIEW_DETAILS_LABEL;
  }
  const noun = warningCount === 1 ? "avertissement" : "avertissements";
  return `${PREVIEW_DETAILS_LABEL} · ${warningCount} ${noun}`;
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
  initialDestination?: Place | null;
  initialQuery?: string;
  navigationActive?: boolean;
  openLocationSettings?: () => boolean;
  /** Injected so the arrival time is deterministic under test. */
  now?: () => number;
  onDestinationChange?: (place: Place | null, query: string) => void;
  /**
   * Hands the host the callback that turns a point picked on its map into this
   * pane's destination. Same shape as `RideMap`'s `onRecenterReady`.
   */
  onMapPickReady?: (pick: (coordinates: Coordinates) => void) => void;
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
  initialDestination = null,
  initialQuery = "",
  navigationActive = false,
  openLocationSettings = openDeviceLocationSettings,
  now = Date.now,
  onDestinationChange,
  onMapPickReady,
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
  /* Collapsed by default: the map behind this pane is the point (FR-038). */
  const [detailsOpen, setDetailsOpen] = useState(false);
  const locateGeneration = useRef(0);
  const pickGeneration = useRef(0);
  const reversePlaceRef = useRef(reversePlace);
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
  // The generate action stays out of the way until the rider has said where
  // they are going: an empty pane offers the search field, nothing else.
  const showGenerate = showsGenerateDestinationAction(state);
  const showDestinationCard =
    state.stage === "selected" && state.destination !== null;
  /*
   * While a trajet is on the map, neither the search field nor the recap card
   * is shown: the preview names the destination itself and "Modifier la
   * destination" reopens the search. A regeneration keeps them folded, so the
   * pane does not grow and shrink under the rider's thumb; a failed generation
   * brings them straight back, since changing the destination is then exactly
   * what is left to do (FR-038).
   */
  const previewOwnsPane =
    preview !== null &&
    (state.phase === "routePreview" || state.phase === "generating");
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
    reversePlaceRef.current = reversePlace;
  }, [reversePlace]);

  /*
   * FR-038 — a point placed on the host's map becomes the destination right
   * away; the reverse geocoding that follows only decorates the label, and a
   * late answer for an abandoned point is dropped by the reducer.
   */
  const handleMapPick = useCallback((coordinates: Coordinates) => {
    const generation = pickGeneration.current + 1;
    pickGeneration.current = generation;
    dispatch({ type: "pick_point", coordinates, generation });

    void reversePlaceRef
      .current(coordinates)
      .then((place) => {
        dispatch({ type: "pick_reverse_success", generation, place });
      })
      .catch(() => {
        dispatch({ type: "pick_reverse_failure", generation });
      });
  }, []);

  useEffect(() => {
    onMapPickReady?.(handleMapPick);
  }, [onMapPickReady, handleMapPick]);

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
        typeof window === "undefined" ? null : window.sessionStorage,
      );
      const style = readStoredRouteStyle(
        typeof window === "undefined" ? null : window.sessionStorage,
      );
      const composed = composeDestinationRide({
        start,
        destination,
        style,
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
      {/* FR-038 — a successful fix is announced to assistive tech only: the
          explorer already shows the map, so a banner repeating where the rider
          is only pushes the destination field down. Locating and failures stay
          visible, next to the actions that resolve them. */}
      <p
        role="status"
        className={
          state.locationStatus === "detected"
            ? "sr-only"
            : "ride-glass rounded-2xl px-4 py-3 text-sm text-white/85"
        }
      >
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

      <div className={previewOwnsPane ? undefined : "mt-3"}>
        {previewOwnsPane ? null : showDestinationCard && state.destination ? (
          <SelectedDestinationCard
            destination={state.destination}
            disabled={destinationLocked}
            onEdit={() => dispatch({ type: "edit_destination_text" })}
            onClear={() => {
              abortRef.current?.abort();
              inFlightRef.current = false;
              dispatch({ type: "clear_destination" });
            }}
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
              <p className="text-sm leading-6 text-muted-foreground">
                {MAP_PICK_HINT}
              </p>
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

      {state.pickStatus === "reverse_geocoding" ? (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          {MAP_PICK_REVERSE_PENDING_MESSAGE}
        </p>
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
        <section aria-label="Trajet généré" className="mt-3 space-y-2">
          {/* Keep the target in view: it is what the rider is deciding about. */}
          {state.destination ? (
            <p className="truncate text-sm font-medium leading-5">
              Vers {state.destination.label}
            </p>
          ) : null}
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div>
              <dd className="text-lg font-semibold leading-6 tabular-nums">
                {formatDistanceLabel(preview.distanceKm)}
              </dd>
              <dt className="text-xs leading-4 text-muted-foreground">distance</dt>
            </div>
            <div>
              <dd className="text-lg font-semibold leading-6 tabular-nums">
                {formatDurationLabel(preview.durationMinutes)}
              </dd>
              <dt className="text-xs leading-4 text-muted-foreground">durée</dt>
            </div>
            <div>
              <dd className="text-lg font-semibold leading-6 tabular-nums">
                {formatEta(now(), preview.durationMinutes)}
              </dd>
              <dt className="text-xs leading-4 text-muted-foreground">arrivée</dt>
            </div>
          </dl>
          {/* Nothing is hidden silently: the toggle counts the warnings it folds
              away, so a rider knows there is something to read (FR-038). */}
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 w-full justify-center text-sm"
            aria-expanded={detailsOpen}
            aria-controls="find-destination-details"
            onClick={() => setDetailsOpen((open) => !open)}
          >
            {detailsOpen
              ? PREVIEW_DETAILS_HIDE_LABEL
              : previewDetailsLabel(preview.warnings.length)}
          </Button>
          {detailsOpen ? (
            <div id="find-destination-details" className="space-y-1">
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
            </div>
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
        className="ride-panel-actions"
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
        ) : showGenerate ? (
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
