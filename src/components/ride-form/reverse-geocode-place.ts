import { mapPointDestination } from "@/domain/destination/destination";
import type { Coordinates, Place } from "@/domain/geo/types";
import { CURRENT_POSITION_FALLBACK_LABEL } from "@/infrastructure/geocoding/labels";

type ReverseGeocodeSuccessBody = {
  data?: {
    place?: Partial<Place> & { label?: unknown };
  };
};

export const CURRENT_POSITION_ADDRESS_UNAVAILABLE_MESSAGE =
  "L’adresse n’a pas pu être déterminée. Le départ utilise votre position actuelle.";

export async function reverseGeocodePlace(
  coordinates: Coordinates,
  locale = "fr",
  fetcher: typeof fetch = fetch,
): Promise<Place> {
  const params = new URLSearchParams({
    latitude: String(coordinates.latitude),
    longitude: String(coordinates.longitude),
    locale,
  });

  const response = await fetcher(`/api/geocode/reverse?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Reverse geocoding failed");
  }

  const body = (await response.json()) as ReverseGeocodeSuccessBody;
  const place = body.data?.place;
  const label = place?.label;
  if (typeof label !== "string" || label.trim() === "") {
    throw new Error("Reverse geocoding failed");
  }

  // Descriptive fields are optional; the caller decides what to display.
  return { ...(place as Place), label, coordinates };
}

export function currentPositionFallback(coordinates: Coordinates): Place {
  return {
    label: CURRENT_POSITION_FALLBACK_LABEL,
    coordinates,
  };
}

/** FR-038 — a map point with no usable address is still a destination. */
export function mapPointFallback(coordinates: Coordinates): Place {
  return mapPointDestination(coordinates);
}
