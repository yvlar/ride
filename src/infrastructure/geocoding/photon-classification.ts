import type { BoundingBox, PlaceKind, PlacePrecision } from "@/domain/geo/types";

/**
 * Maps Photon's `osm_key` / `osm_value` / `type` vocabulary onto the domain's
 * `PlaceKind`. Pure and separately testable so the HTTP adapter stays about
 * transport, exactly like `nominatim-classification.ts`.
 *
 * Two Photon quirks drive the rule order below:
 *
 * - a postal-code feature reports `type: "other"`, not `"postcode"`; only
 *   `osm_value` identifies it, and the code itself lives in `name`;
 * - `type: "house"` also covers points of interest (a shop with a street
 *   number), so the house number — not the type — is what makes an address.
 */

const CITY_TYPES = new Set([
  "city",
  "district",
  "locality",
  "county",
  "municipality",
  "village",
  "town",
]);

export type PhotonClassification = {
  osmKey?: string;
  osmValue?: string;
  type?: string;
  hasHouseNumber: boolean;
};

export function classifyPhotonPlace(input: PhotonClassification): PlaceKind {
  const osmValue = input.osmValue?.toLowerCase();
  const type = input.type?.toLowerCase();

  // Must come first, and must not consult `type`: it reads "other" here.
  if (osmValue === "postcode") {
    return "postal_code";
  }

  if (input.hasHouseNumber) {
    return "address";
  }

  if (type === "street") {
    return "address";
  }

  if (type && CITY_TYPES.has(type)) {
    return "city";
  }

  return "place";
}

/**
 * FR-038 — a zone rather than a point stays `approximate`, so the rider is
 * offered a marker to adjust.
 *
 * This diverges from `nominatimPrecision` by also reading the feature type: a
 * Photon `street` is one OSM way segment's point, and "Rue Principale" spans
 * kilometres across the segments Photon returns. Calling that `exact` would
 * drop the marker on an arbitrary stretch with no way to correct it.
 */
export function photonPrecision(
  kind: PlaceKind,
  input: { hasHouseNumber: boolean; type?: string },
): PlacePrecision {
  if (input.hasHouseNumber) {
    return "exact";
  }
  if (kind === "postal_code" || kind === "city") {
    return "approximate";
  }
  return input.type?.toLowerCase() === "street" ? "approximate" : "exact";
}

/**
 * Photon returns `extent` as `[west, north, east, south]` — *not* Nominatim's
 * `[south, north, west, east]`. Swapping a pair still type-checks and still
 * yields a plausible box, so this order is asserted in the tests.
 */
export function parsePhotonExtent(values: unknown): BoundingBox | null {
  if (!Array.isArray(values) || values.length < 4) {
    return null;
  }
  const [west, north, east, south] = values.map((value) => Number(value));
  if (
    !Number.isFinite(west) ||
    !Number.isFinite(north) ||
    !Number.isFinite(east) ||
    !Number.isFinite(south)
  ) {
    return null;
  }
  return { west, south, east, north };
}
