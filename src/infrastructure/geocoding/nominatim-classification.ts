import type { PlaceKind, PlacePrecision } from "@/domain/geo/types";

/**
 * Maps Nominatim's `class` / `type` / `addresstype` vocabulary onto the
 * domain's `PlaceKind`. Pure and separately testable so the HTTP adapter stays
 * about transport.
 */

const CITY_TYPES = new Set([
  "city",
  "town",
  "village",
  "hamlet",
  "municipality",
  "borough",
  "suburb",
  "quarter",
  "locality",
]);

const ADDRESS_TYPES = new Set([
  "house",
  "building",
  "residential",
  "address",
  "house_number",
  "apartments",
]);

/**
 * Administrative boundaries below this rank are countries, states and regions
 * rather than municipalities. Nominatim ranks a country at 4, a state at 8 and
 * a municipality at 16 or above.
 */
const MIN_MUNICIPALITY_PLACE_RANK = 12;

export type NominatimClassification = {
  category?: string;
  type?: string;
  addressType?: string;
  placeRank?: number;
  hasHouseNumber: boolean;
  hasPostalCode: boolean;
};

export function classifyNominatimPlace(
  input: NominatimClassification,
): PlaceKind {
  const type = input.type?.toLowerCase();
  const addressType = input.addressType?.toLowerCase();
  const category = input.category?.toLowerCase();

  if (type === "postcode" || addressType === "postcode") {
    return "postal_code";
  }

  if (input.hasHouseNumber) {
    return "address";
  }

  for (const candidate of [addressType, type]) {
    if (!candidate) {
      continue;
    }
    if (ADDRESS_TYPES.has(candidate)) {
      return "address";
    }
    if (CITY_TYPES.has(candidate)) {
      return "city";
    }
  }

  if (
    category === "boundary" &&
    type === "administrative" &&
    (input.placeRank ?? 0) >= MIN_MUNICIPALITY_PLACE_RANK
  ) {
    return "city";
  }

  return "place";
}

/**
 * FR-038 — a zone rather than a point. Postal codes and municipalities are
 * approximate, so the rider is offered a marker to adjust.
 */
export function nominatimPrecision(
  kind: PlaceKind,
  hasHouseNumber: boolean,
): PlacePrecision {
  if (hasHouseNumber) {
    return "exact";
  }
  return kind === "postal_code" || kind === "city" ? "approximate" : "exact";
}

/** Nominatim returns `[south, north, west, east]` as strings. */
export function parseNominatimBoundingBox(
  values: unknown,
): { west: number; south: number; east: number; north: number } | null {
  if (!Array.isArray(values) || values.length < 4) {
    return null;
  }
  const [south, north, west, east] = values.map((value) => Number(value));
  if (
    !Number.isFinite(south) ||
    !Number.isFinite(north) ||
    !Number.isFinite(west) ||
    !Number.isFinite(east)
  ) {
    return null;
  }
  return { west, south, east, north };
}
