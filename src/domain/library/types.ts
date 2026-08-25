import type { Place } from "@/domain/geo/types";
import type { GenerateRideRequest, GeneratedRideRoute } from "@/domain/ride/types";

export type SavedRide = {
  id: string;
  name: string;
  savedAtMs: number;
  request: GenerateRideRequest;
  route: GeneratedRideRoute;
};

export type RideLibrary = {
  listRecents(): Place[];
  rememberPlace(place: Place): void;
  listSaved(): SavedRide[];
  save(ride: SavedRide): void;
  remove(id: string): void;
  get(id: string): SavedRide | null;
};

export const RIDE_LIBRARY_MAX_RECENTS = 8;
export const RIDE_LIBRARY_MAX_SAVED = 20;

export function rememberRecentPlace(
  recents: Place[],
  place: Place,
  max = RIDE_LIBRARY_MAX_RECENTS,
): Place[] {
  const without = recents.filter(
    (item) =>
      item.label !== place.label ||
      item.coordinates.latitude !== place.coordinates.latitude ||
      item.coordinates.longitude !== place.coordinates.longitude,
  );
  return [place, ...without].slice(0, max);
}

export function upsertSavedRide(
  rides: SavedRide[],
  ride: SavedRide,
  max = RIDE_LIBRARY_MAX_SAVED,
): SavedRide[] {
  const without = rides.filter((item) => item.id !== ride.id);
  return [ride, ...without].slice(0, max);
}

export function savedRideName(route: GeneratedRideRoute): string {
  if (route.type === "gpx") {
    return route.name;
  }
  if (route.type === "loop") {
    return `Boucle · ${route.start.label}`;
  }
  if (route.type === "round_trip") {
    return `${route.start.label} ⇄ ${route.destination.label}`;
  }
  return `${route.start.label} → ${route.destination.label}`;
}
