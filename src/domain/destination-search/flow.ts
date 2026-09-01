import {
  isUsableDestination,
  mapPointDestination,
} from "@/domain/destination/destination";
import type { Coordinates, Place } from "@/domain/geo/types";
import type { GenerateRideRequest, GeneratedRideRoute } from "@/domain/ride/types";

/**
 * FR-038 — exclusive UI/domain phases for Trouver une destination.
 * Navigation session state remains FR-036; this machine owns the search pane.
 */
export type DestinationSearchPhase =
  | "idle"
  | "locating"
  | "destinationReady"
  | "generating"
  | "routePreview"
  | "navigating"
  | "cancelling"
  | "error";

export type DestinationLocationStatus =
  | "locating"
  | "detected"
  | "permission_denied"
  | "unavailable";

export type DestinationSearchErrorKind = "location" | "generation";

export type DestinationSearchError = {
  kind: DestinationSearchErrorKind;
  message: string;
  suggestions: string[];
};

/**
 * FR-038 — whether the pane shows the search field or the confirmed
 * destination card. Independent of `phase`, which tracks the ride itself.
 */
export type DestinationStage = "searching" | "selected";

/**
 * FR-038 — how far the reverse geocoding of the current map point got. The
 * point itself is a usable destination the moment it is placed, so this only
 * ever decorates the label.
 */
export type MapPickStatus =
  | "idle"
  | "reverse_geocoding"
  | "ready"
  | "reverse_failed";

export const MAP_PICK_REVERSE_PENDING_MESSAGE = "Recherche de l’adresse…";

export type DestinationSearchState = {
  phase: DestinationSearchPhase;
  stage: DestinationStage;
  /*
   * Reverse geocoding of a map point answers out of order. `pickGeneration`
   * identifies the point a pending lookup was started for, and `pickStatus`
   * says whether one is still awaited at all: any other write to the
   * destination resets it to "idle", so a late answer for a point the rider
   * has moved away from — or replaced with a typed address — is dropped
   * instead of overwriting the newer label.
   */
  pickGeneration: number;
  pickStatus: MapPickStatus;
  start: Place | null;
  destination: Place | null;
  destinationQuery: string;
  route: GeneratedRideRoute | null;
  request: GenerateRideRequest | null;
  generationId: number;
  error: DestinationSearchError | null;
  locationStatus: DestinationLocationStatus;
};

export type DestinationSearchEvent =
  | { type: "locate_start" }
  | { type: "locate_success"; start: Place }
  | {
      type: "locate_failure";
      reason: Exclude<DestinationLocationStatus, "locating" | "detected">;
      message: string;
    }
  | { type: "set_destination"; destination: Place }
  | { type: "change_destination_query"; query: string }
  | { type: "generate_start" }
  | {
      type: "generate_success";
      generationId: number;
      route: GeneratedRideRoute;
      request: GenerateRideRequest;
    }
  | {
      type: "generate_failure";
      generationId: number;
      message: string;
      suggestions: string[];
    }
  | { type: "generate_aborted"; generationId: number }
  | { type: "clear_destination" }
  | { type: "edit_destination_text" }
  | { type: "pick_point"; coordinates: Coordinates; generation: number }
  | { type: "pick_reverse_success"; generation: number; place: Place }
  | { type: "pick_reverse_failure"; generation: number }
  | { type: "start_navigation" }
  | { type: "cancel_navigation" }
  | { type: "cancel_completed" }
  | { type: "edit_destination" };

export function emptyDestinationSearchState(): DestinationSearchState {
  return {
    phase: "locating",
    stage: "searching",
    pickGeneration: 0,
    pickStatus: "idle",
    start: null,
    destination: null,
    destinationQuery: "",
    route: null,
    request: null,
    generationId: 0,
    error: null,
    locationStatus: "locating",
  };
}

export function createDestinationSearchState(options?: {
  destination?: Place | null;
  destinationQuery?: string;
}): DestinationSearchState {
  const destination = options?.destination ?? null;
  return {
    ...emptyDestinationSearchState(),
    stage: isUsableDestination(destination) ? "selected" : "searching",
    destination,
    destinationQuery:
      options?.destinationQuery ?? destination?.label ?? "",
  };
}

export function canGenerateDestinationSearch(
  state: DestinationSearchState,
): boolean {
  // A destination is only ever set by an explicit selection or a point placed
  // on the map; editing the text clears it, so raw field text can never reach
  // the routing engine (FR-038). A point is routable the moment it lands, so a
  // reverse geocoding still in flight is deliberately not a reason to wait.
  if (!state.start || !isUsableDestination(state.destination)) {
    return false;
  }
  if (
    state.phase === "locating" ||
    state.phase === "generating" ||
    state.phase === "navigating" ||
    state.phase === "cancelling"
  ) {
    return false;
  }
  return true;
}

/**
 * FR-038 — the generate action only exists once a destination is chosen.
 * Deliberately separate from `canGenerateDestinationSearch`: a missing GPS fix
 * or an in-flight generation disables the button, it never removes it.
 */
export function showsGenerateDestinationAction(
  state: DestinationSearchState,
): boolean {
  return isUsableDestination(state.destination);
}

export function canStartDestinationNavigation(
  state: DestinationSearchState,
): boolean {
  return (
    state.phase === "routePreview" &&
    state.route !== null &&
    state.request !== null
  );
}

function phaseAfterLocation(state: DestinationSearchState): DestinationSearchPhase {
  if (
    state.phase === "generating" ||
    state.phase === "routePreview" ||
    state.phase === "navigating" ||
    state.phase === "cancelling"
  ) {
    return state.phase;
  }
  if (state.destination && state.start) {
    return "destinationReady";
  }
  return state.start ? "idle" : "error";
}

function invalidatePreview(state: DestinationSearchState): DestinationSearchState {
  return {
    ...state,
    route: null,
    request: null,
    generationId: state.generationId + 1,
  };
}

export function reduceDestinationSearch(
  state: DestinationSearchState,
  event: DestinationSearchEvent,
): DestinationSearchState {
  switch (event.type) {
    case "locate_start": {
      if (
        state.phase === "navigating" ||
        state.phase === "cancelling" ||
        state.phase === "generating" ||
        state.phase === "routePreview"
      ) {
        return state;
      }
      return {
        ...state,
        phase: "locating",
        locationStatus: "locating",
        error: state.error?.kind === "location" ? null : state.error,
      };
    }
    case "locate_success": {
      if (state.phase === "navigating" || state.phase === "cancelling") {
        return state;
      }
      const next: DestinationSearchState = {
        ...state,
        start: event.start,
        locationStatus: "detected",
        error: state.error?.kind === "location" ? null : state.error,
      };
      return { ...next, phase: phaseAfterLocation(next) };
    }
    case "locate_failure": {
      if (state.phase === "navigating" || state.phase === "cancelling") {
        return state;
      }
      const keepStart = state.start;
      return {
        ...state,
        start: keepStart,
        locationStatus: event.reason,
        error: {
          kind: "location",
          message: event.message,
          suggestions: ["Réessayer la localisation"],
        },
        phase:
          state.phase === "generating"
            ? "error"
            : keepStart
              ? phaseAfterLocation(state)
              : "error",
      };
    }
    case "set_destination": {
      if (state.phase === "navigating" || state.phase === "cancelling") {
        return state;
      }
      const destChanged =
        state.destination === null ||
        state.destination.coordinates.latitude !==
          event.destination.coordinates.latitude ||
        state.destination.coordinates.longitude !==
          event.destination.coordinates.longitude;
      const next = destChanged ? invalidatePreview(state) : state;
      const withDest: DestinationSearchState = {
        ...next,
        stage: "selected",
        // Any pending reverse geocoding belonged to a point the rider has now
        // replaced; `pick_*` re-arms the status when a point is placed.
        pickStatus: "idle",
        destination: event.destination,
        destinationQuery: event.destination.label,
        error: next.error?.kind === "generation" ? null : next.error,
      };
      if (withDest.phase === "generating") {
        return {
          ...withDest,
          phase: withDest.start ? "destinationReady" : "locating",
        };
      }
      return {
        ...withDest,
        phase: withDest.start ? "destinationReady" : withDest.phase,
      };
    }
    case "change_destination_query": {
      if (state.phase === "navigating" || state.phase === "cancelling") {
        return state;
      }
      const stillSelected =
        state.destination !== null && state.destination.label === event.query;
      const next = stillSelected ? state : invalidatePreview(state);
      const destination = stillSelected ? next.destination : null;
      return {
        ...next,
        stage: destination ? "selected" : "searching",
        pickStatus: "idle",
        destination,
        destinationQuery: event.query,
        phase:
          next.phase === "generating"
            ? next.start
              ? "idle"
              : "locating"
            : next.phase === "routePreview"
              ? next.start
                ? "idle"
                : next.phase
              : destination && next.start
                ? "destinationReady"
                : next.phase === "error"
                  ? "error"
                  : next.start
                    ? "idle"
                    : next.phase,
      };
    }
    case "generate_start": {
      if (state.phase === "navigating" || state.phase === "cancelling") {
        return state;
      }
      if (!state.start || !state.destination) {
        return state;
      }
      return {
        ...state,
        phase: "generating",
        generationId: state.generationId + 1,
        error: null,
      };
    }
    case "generate_success": {
      if (event.generationId !== state.generationId) {
        return state;
      }
      if (state.phase === "navigating" || state.phase === "cancelling") {
        return state;
      }
      return {
        ...state,
        phase: "routePreview",
        route: event.route,
        request: event.request,
        error: null,
      };
    }
    case "generate_failure": {
      if (event.generationId !== state.generationId) {
        return state;
      }
      if (state.phase === "navigating" || state.phase === "cancelling") {
        return state;
      }
      return {
        ...state,
        phase: "error",
        error: {
          kind: "generation",
          message: event.message,
          suggestions: event.suggestions,
        },
      };
    }
    case "generate_aborted": {
      if (event.generationId !== state.generationId) {
        return state;
      }
      if (state.phase !== "generating") {
        return state;
      }
      return {
        ...state,
        phase:
          state.route && state.request
            ? "routePreview"
            : state.destination && state.start
              ? "destinationReady"
              : state.start
                ? "idle"
                : "locating",
      };
    }
    case "clear_destination": {
      if (state.phase === "navigating" || state.phase === "cancelling") {
        return state;
      }
      return {
        ...invalidatePreview(state),
        stage: "searching",
        pickStatus: "idle",
        destination: null,
        destinationQuery: "",
        error: state.error?.kind === "generation" ? null : state.error,
        phase: state.start ? "idle" : state.phase,
      };
    }
    case "edit_destination_text": {
      if (state.phase === "navigating" || state.phase === "cancelling") {
        return state;
      }
      // Reopens the field with the current text. The destination stays valid
      // until the text actually changes (FR-038).
      return { ...state, stage: "searching" };
    }
    case "pick_point": {
      if (state.phase === "navigating" || state.phase === "cancelling") {
        return state;
      }
      // Coordinates alone already make a valid destination, so the rider can
      // generate immediately even if reverse geocoding never answers (FR-038).
      const placed = reduceDestinationSearch(state, {
        type: "set_destination",
        destination: mapPointDestination(event.coordinates),
      });
      return {
        ...placed,
        pickGeneration: event.generation,
        pickStatus: "reverse_geocoding",
      };
    }
    case "pick_reverse_success": {
      // `pickStatus` is the real guard: any write to the destination in the
      // meantime resets it to "idle", so a late answer for an abandoned point
      // can never overwrite a newer label (FR-038).
      if (
        state.pickStatus !== "reverse_geocoding" ||
        event.generation !== state.pickGeneration ||
        !state.destination
      ) {
        return state;
      }
      const decorated = reduceDestinationSearch(state, {
        type: "set_destination",
        destination: mapPointDestination(
          state.destination.coordinates,
          event.place,
        ),
      });
      return {
        ...decorated,
        pickGeneration: event.generation,
        pickStatus: "ready",
      };
    }
    case "pick_reverse_failure": {
      if (
        state.pickStatus !== "reverse_geocoding" ||
        event.generation !== state.pickGeneration
      ) {
        return state;
      }
      // The coordinate-only destination placed by `pick_point` stands.
      return { ...state, pickStatus: "reverse_failed" };
    }
    case "start_navigation": {
      if (state.phase === "navigating" || state.phase === "cancelling") {
        return state;
      }
      if (state.phase !== "routePreview" || !state.route || !state.request) {
        return state;
      }
      return {
        ...state,
        phase: "navigating",
        generationId: state.generationId + 1,
      };
    }
    case "cancel_navigation": {
      if (state.phase !== "navigating") {
        return state;
      }
      return {
        ...state,
        phase: "cancelling",
        generationId: state.generationId + 1,
      };
    }
    case "cancel_completed": {
      if (state.phase !== "cancelling" && state.phase !== "navigating") {
        return state;
      }
      return {
        ...state,
        phase: "locating",
        pickStatus: "idle",
        route: null,
        request: null,
        error: null,
        generationId: state.generationId + 1,
        locationStatus: "locating",
      };
    }
    case "edit_destination": {
      if (state.phase === "navigating" || state.phase === "cancelling") {
        return state;
      }
      return {
        ...invalidatePreview(state),
        phase: state.destination && state.start ? "destinationReady" : "idle",
      };
    }
    default: {
      return state;
    }
  }
}
