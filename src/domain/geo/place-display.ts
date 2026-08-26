import type { Place } from "@/domain/geo/types";

export const PLACE_TYPE_LABELS = {
  address: "Adresse",
  city: "Ville",
  postal_code: "Code postal",
  place: "Lieu",
} as const;

/**
 * FR-032 — primary line for a search result. Never invents a place name.
 */
export function placePrimaryName(place: Place): string {
  const name = place.name?.trim();
  if (name) {
    return name;
  }
  const beforeComma = place.label.split(",")[0]?.trim();
  return beforeComma || place.label;
}

/**
 * FR-032 — secondary line (address / locality) so similar places stay distinct.
 */
export function placeSecondaryLine(place: Place): string | null {
  const parts = [
    place.addressLine?.trim(),
    place.locality?.trim(),
    place.region?.trim(),
    place.postalCode?.trim(),
    place.country?.trim(),
  ].filter((part): part is string => Boolean(part));

  if (parts.length === 0) {
    const primary = placePrimaryName(place);
    const remainder = place.label
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part && part !== primary);
    return remainder.length > 0 ? remainder.join(", ") : null;
  }

  const unique = parts.filter(
    (part, index) => parts.indexOf(part) === index && part !== place.name?.trim(),
  );
  return unique.length > 0 ? unique.join(", ") : null;
}

export function placeTypeLabel(place: Place): string {
  return PLACE_TYPE_LABELS[place.type ?? "place"];
}

export function placePrecisionLabel(place: Place): string | null {
  return place.precision === "approximate" ? "Emplacement approximatif" : null;
}
