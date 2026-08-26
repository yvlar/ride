import { haversineKm } from "@/domain/geo/distance";
import type { Coordinates, Place } from "@/domain/geo/types";

/**
 * FR-032 / FR-038 — Québec first, then the rest of Canada, then everywhere
 * else. This is a *preference*, never a filter: a provider result outside
 * Canada is ranked lower but always kept, so a rider heading to Vermont or
 * to Europe still finds their destination.
 *
 * Ranking lives here rather than in the geocoding adapter because Nominatim
 * only offers `countrycodes`, which is an exclusive filter.
 */

const QUEBEC_REGION_NAMES = ["quebec", "qc"];

const CANADA_COUNTRY_NAMES = ["canada", "ca"];

/** Regions that identify Canada even when the provider omits the country. */
const CANADIAN_REGION_NAMES = [
  "quebec",
  "qc",
  "ontario",
  "on",
  "nouveau-brunswick",
  "new brunswick",
  "nb",
  "nouvelle-ecosse",
  "nova scotia",
  "ns",
  "ile-du-prince-edouard",
  "prince edward island",
  "pe",
  "terre-neuve-et-labrador",
  "newfoundland and labrador",
  "nl",
  "manitoba",
  "mb",
  "saskatchewan",
  "sk",
  "alberta",
  "ab",
  "colombie-britannique",
  "british columbia",
  "bc",
  "yukon",
  "yt",
  "territoires du nord-ouest",
  "northwest territories",
  "nt",
  "nunavut",
  "nu",
];

function normalize(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export function isQuebecPlace(place: Place): boolean {
  return QUEBEC_REGION_NAMES.includes(normalize(place.region));
}

export function isCanadianPlace(place: Place): boolean {
  const country = normalize(place.country);
  if (country) {
    return CANADA_COUNTRY_NAMES.includes(country);
  }
  return CANADIAN_REGION_NAMES.includes(normalize(place.region));
}

/** Higher is better. Québec outranks Canada, which outranks everywhere else. */
export function regionPriority(place: Place): number {
  if (isQuebecPlace(place)) {
    return 2;
  }
  return isCanadianPlace(place) ? 1 : 0;
}

export type RankPlacesOptions = {
  /** Current position, when known. Nearer results win inside a tier. */
  proximity?: Coordinates | null;
};

/**
 * Stable ordering: region priority, then distance to the rider when a position
 * is known, then the provider's own order.
 */
export function rankPlaces(
  places: Place[],
  options: RankPlacesOptions = {},
): Place[] {
  const proximity = options.proximity ?? null;

  return places
    .map((place, index) => ({
      place,
      index,
      priority: regionPriority(place),
      distanceKm: proximity
        ? haversineKm(proximity, place.coordinates)
        : null,
    }))
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }
      if (left.distanceKm !== null && right.distanceKm !== null) {
        const delta = left.distanceKm - right.distanceKm;
        if (delta !== 0) {
          return delta;
        }
      }
      return left.index - right.index;
    })
    .map((entry) => entry.place);
}
