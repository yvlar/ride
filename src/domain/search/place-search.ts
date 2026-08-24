import type { Place } from "@/domain/geo/types";

export type PlaceSearchStatus =
  | "empty"
  | "typing"
  | "loading"
  | "results"
  | "no_results"
  | "offline"
  | "provider_error"
  | "selected"
  | "cancelled";

export type PlaceSearchState = {
  query: string;
  status: PlaceSearchStatus;
  places: Place[];
  error: string | null;
  selected: Place | null;
  generation: number;
};

export const PLACE_SEARCH_MIN_QUERY_LENGTH = 2;

export const PLACE_SEARCH_EMPTY_MESSAGE = "Saisissez un lieu, une adresse ou un nom.";
export const PLACE_SEARCH_NO_RESULTS_MESSAGE = "Aucun lieu trouvé.";
export const PLACE_SEARCH_OFFLINE_MESSAGE =
  "Pas de réseau. Vérifiez la connexion, puis réessayez.";
export const PLACE_SEARCH_PROVIDER_ERROR_MESSAGE =
  "La recherche de lieu a échoué.";

export type PlaceSearchAction =
  | { type: "query"; query: string }
  | { type: "begin"; query: string; generation: number }
  | { type: "loading"; generation: number }
  | { type: "success"; generation: number; query: string; places: Place[] }
  | { type: "failure"; generation: number; reason: "offline" | "provider" }
  | { type: "select"; place: Place }
  | { type: "cancel" }
  | { type: "reset" };

export function emptyPlaceSearchState(): PlaceSearchState {
  return {
    query: "",
    status: "empty",
    places: [],
    error: null,
    selected: null,
    generation: 0,
  };
}

export function nextSearchGeneration(state: PlaceSearchState): number {
  return state.generation + 1;
}

export function reducePlaceSearch(
  state: PlaceSearchState,
  action: PlaceSearchAction,
): PlaceSearchState {
  switch (action.type) {
    case "reset":
      return emptyPlaceSearchState();
    case "cancel":
      return {
        ...state,
        generation: state.generation + 1,
        status: "cancelled",
        places: [],
        error: null,
      };
    case "query": {
      const query = action.query;
      const trimmed = query.trim();
      const selected =
        state.selected && state.selected.label === trimmed ? state.selected : null;
      if (selected) {
        return {
          ...state,
          query,
          selected,
          status: "selected",
          places: [],
          error: null,
        };
      }
      if (trimmed.length < PLACE_SEARCH_MIN_QUERY_LENGTH) {
        return {
          ...state,
          query,
          selected: null,
          status: trimmed.length === 0 ? "empty" : "typing",
          places: [],
          error: null,
        };
      }
      return {
        ...state,
        query,
        selected: null,
        status: "typing",
        places: [],
        error: null,
      };
    }
    case "begin":
      return {
        ...state,
        query: action.query,
        generation: action.generation,
        selected: null,
        status: "loading",
        places: [],
        error: null,
      };
    case "loading":
      if (action.generation !== state.generation) {
        return state;
      }
      return { ...state, status: "loading", error: null };
    case "success":
      if (action.generation !== state.generation || state.status === "cancelled") {
        return state;
      }
      if (action.query.trim() !== state.query.trim()) {
        return state;
      }
      return {
        ...state,
        status: action.places.length === 0 ? "no_results" : "results",
        places: action.places,
        error:
          action.places.length === 0 ? PLACE_SEARCH_NO_RESULTS_MESSAGE : null,
      };
    case "failure":
      if (action.generation !== state.generation || state.status === "cancelled") {
        return state;
      }
      return {
        ...state,
        status: action.reason === "offline" ? "offline" : "provider_error",
        places: [],
        error:
          action.reason === "offline"
            ? PLACE_SEARCH_OFFLINE_MESSAGE
            : PLACE_SEARCH_PROVIDER_ERROR_MESSAGE,
      };
    case "select":
      return {
        ...state,
        generation: state.generation + 1,
        query: action.place.label,
        selected: action.place,
        status: "selected",
        places: [],
        error: null,
      };
    default:
      return state;
  }
}

export function isStaleSearchGeneration(
  current: number,
  incoming: number,
): boolean {
  return incoming !== current;
}

export function classifySearchFailure(error: unknown): "offline" | "provider" {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "provider";
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "offline";
  }
  if (error instanceof TypeError) {
    return "offline";
  }
  return "provider";
}
