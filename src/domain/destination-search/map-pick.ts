import { mapPointDestination } from "@/domain/destination/destination";
import type { Coordinates, Place } from "@/domain/geo/types";

/**
 * FR-038 — state of the full-screen "Choisir sur la carte" surface.
 *
 * The `generation` counter plays the same role as in `place-search.ts`: each
 * marker move starts a new reverse-geocoding request, and a slow answer for an
 * older position must never overwrite the label of the newer one.
 */
export type MapPickStatus =
  | "idle"
  | "reverse_geocoding"
  | "ready"
  | "reverse_failed";

export type MapPickState = {
  point: Coordinates | null;
  place: Place | null;
  status: MapPickStatus;
  generation: number;
};

export type MapPickEvent =
  | { type: "place_point"; coordinates: Coordinates; generation: number }
  | { type: "reverse_success"; generation: number; place: Place }
  | { type: "reverse_failure"; generation: number }
  | { type: "reset" };

export const MAP_PICK_REVERSE_PENDING_MESSAGE = "Recherche de l’adresse…";

export function emptyMapPickState(): MapPickState {
  return { point: null, place: null, status: "idle", generation: 0 };
}

export function createMapPickState(point?: Coordinates | null): MapPickState {
  if (!point) {
    return emptyMapPickState();
  }
  return {
    point,
    place: mapPointDestination(point),
    status: "ready",
    generation: 0,
  };
}

export function nextMapPickGeneration(state: MapPickState): number {
  return state.generation + 1;
}

/** A point is confirmable as soon as it exists, reverse geocoding or not. */
export function canConfirmMapPick(state: MapPickState): boolean {
  return state.point !== null && state.place !== null;
}

export function reduceMapPick(
  state: MapPickState,
  event: MapPickEvent,
): MapPickState {
  switch (event.type) {
    case "reset":
      return emptyMapPickState();
    case "place_point":
      return {
        point: event.coordinates,
        // Coordinates alone already make a valid destination, so the rider can
        // confirm immediately even if reverse geocoding never answers.
        place: mapPointDestination(event.coordinates),
        status: "reverse_geocoding",
        generation: event.generation,
      };
    case "reverse_success": {
      if (event.generation !== state.generation || !state.point) {
        return state;
      }
      return {
        ...state,
        place: mapPointDestination(state.point, event.place),
        status: "ready",
      };
    }
    case "reverse_failure": {
      if (event.generation !== state.generation || !state.point) {
        return state;
      }
      return {
        ...state,
        place: mapPointDestination(state.point),
        status: "reverse_failed",
      };
    }
    default:
      return state;
  }
}
