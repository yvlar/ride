import type {
  Coordinates,
  Place,
  PlaceKind,
  PlacePrecision,
} from "@/domain/geo/types";
import { placePrimaryName, placeSecondaryLine } from "@/domain/geo/place-display";

/**
 * FR-038 — a destination is a `Place` with usable coordinates, whatever the
 * rider used to express it: an address, a municipality, a postal code, or a
 * point dropped on the map. There is deliberately no second model: the routing
 * engine, the preview and the recap card all read the same `Place`.
 */

export const MAP_POINT_LABEL = "Point sélectionné sur la carte";

export const DESTINATION_KIND_LABELS: Record<PlaceKind, string> = {
  address: "Adresse",
  city: "Ville",
  postal_code: "Code postal",
  place: "Lieu",
};

export const APPROXIMATE_DESTINATION_NOTICE =
  "Emplacement approximatif. Ajustez le marqueur avant de générer le trajet.";

export function isUsableCoordinates(
  coordinates: Coordinates | null | undefined,
): coordinates is Coordinates {
  if (!coordinates) {
    return false;
  }
  const { latitude, longitude } = coordinates;
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * BR-004 — the generate button reads this, never the raw text in the field.
 * A destination without valid coordinates is not a destination.
 */
export function isUsableDestination(
  place: Place | null | undefined,
): place is Place {
  if (!place || place.label.trim() === "") {
    return false;
  }
  return isUsableCoordinates(place.coordinates);
}

export function formatCoordinates(coordinates: Coordinates): string {
  return `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`;
}

export function destinationKindLabel(place: Place): string | null {
  return place.kind ? DESTINATION_KIND_LABELS[place.kind] : null;
}

export function isApproximateDestination(place: Place): boolean {
  return place.precision === "approximate";
}

export type DestinationSummary = {
  /** Name or address shown first. */
  primary: string;
  /** Municipality, region and country, when the provider supplied them. */
  secondary: string | null;
  kindLabel: string | null;
  approximate: boolean;
  coordinatesLabel: string;
};

/** FR-038 — the recap card that replaces the results once a rider confirms. */
export function destinationSummary(place: Place): DestinationSummary {
  return {
    primary: placePrimaryName(place),
    secondary: placeSecondaryLine(place),
    kindLabel: destinationKindLabel(place),
    approximate: isApproximateDestination(place),
    coordinatesLabel: formatCoordinates(place.coordinates),
  };
}

/**
 * FR-038 — a point dropped on the map. Reverse geocoding enriches the label
 * when it succeeds; when it fails the coordinates themselves are the label, so
 * a reverse-geocoding outage never blocks the selection.
 */
export function mapPointDestination(
  coordinates: Coordinates,
  reversed?: Place | null,
): Place {
  if (reversed && reversed.label.trim() !== "") {
    return {
      ...reversed,
      coordinates,
      source: "map",
      precision: reversed.precision ?? "exact",
    };
  }

  return {
    label: `${MAP_POINT_LABEL} (${formatCoordinates(coordinates)})`,
    name: MAP_POINT_LABEL,
    coordinates,
    source: "map",
    kind: "place",
    precision: "exact",
  };
}

/** True when the two places point at a different spot on the ground. */
export function hasMovedDestination(
  previous: Place | null,
  next: Place,
): boolean {
  if (!previous) {
    return true;
  }
  return (
    previous.coordinates.latitude !== next.coordinates.latitude ||
    previous.coordinates.longitude !== next.coordinates.longitude ||
    previous.label !== next.label
  );
}

export type { PlaceKind, PlacePrecision };
