import { placePrimaryName } from "@/domain/geo/place-display";
import type { Place } from "@/domain/geo/types";

/**
 * FR-032 — a geocoder answers with the objects it indexes, not with the offers
 * a rider can choose between. Photon returns one row per OSM way segment, so
 * "Rue Principale, Granby" arrives five times; a municipality search brings
 * back the same name as a city, a hamlet and a couple of landmarks. Showing
 * eight rows that read identically hides the seven real alternatives.
 *
 * Collapsing is decided on what the rider *reads*, never on distance: two
 * segments of Rue Principale kilometres apart are still one street, and a
 * distance threshold would bring the duplicates straight back. Region and
 * country stay in the signature because Granby (Québec), Granby (Vermont) and
 * Granby (Massachusetts) differ by nothing else and must all survive.
 */

function normalize(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** The identity of "the same place said twice". Coordinates are excluded. */
export function placeSignature(place: Place): string {
  return [
    // The primary line is what the rider compares, so the key is built from
    // the same helper the list renders with.
    placePrimaryName(place),
    place.addressLine,
    place.locality,
    place.region,
    place.country,
    place.kind,
  ]
    .map((part) => normalize(part))
    .join("|");
}

/** Keeps the first occurrence of each signature, preserving order. */
export function dedupePlaces(places: Place[]): Place[] {
  const seen = new Set<string>();
  return places.filter((place) => {
    const signature = placeSignature(place);
    if (seen.has(signature)) {
      return false;
    }
    seen.add(signature);
    return true;
  });
}
