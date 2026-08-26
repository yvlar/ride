import type { Place } from "@/domain/geo/types";
import { hasValidCoordinates } from "@/domain/geo/coordinates";
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

export type DestinationSearchState = {
  phase: DestinationSearchPhase;
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
  | { type: "unselect_destination" }
  | { type: "clear_destination" }
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
  | { type: "start_navigation" }
  | { type: "cancel_navigation" }
  | { type: "cancel_completed" }
  | { type: "edit_destination" };

export function emptyDestinationSearchState(): DestinationSearchState {
  return {
    phase: "locating",
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
    destination,
    destinationQuery:
      options?.destinationQuery ?? destination?.label ?? "",
  };
}

export function canGenerateDestinationSearch(
  state: DestinationSearchState,
): boolean {
  if (
    !state.start ||
    !state.destination ||
    !hasValidCoordinates(state.start.coordinates) ||
    !hasValidCoordinates(state.destination.coordinates)
  ) {
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
      if (!hasValidCoordinates(event.destination.coordinates)) {
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
    case "unselect_destination": {
      if (state.phase === "navigating" || state.phase === "cancelling") {
        return state;
      }
      const next = invalidatePreview(state);
      return {
        ...next,
        destination: null,
        phase: next.start ? "idle" : "locating",
        error: next.error?.kind === "generation" ? null : next.error,
      };
    }
    case "clear_destination": {
      if (state.phase === "navigating" || state.phase === "cancelling") {
        return state;
      }
      const next = invalidatePreview(state);
      return {
        ...next,
        destination: null,
        destinationQuery: "",
        phase: next.start ? "idle" : "locating",
        error: next.error?.kind === "generation" ? null : next.error,
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
        destination: null,
        phase: state.start ? "idle" : "locating",
      };
    }
    default: {
      return state;
    }
  }
}
