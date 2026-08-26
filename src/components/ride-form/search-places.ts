import type { Coordinates, Place } from "@/domain/geo/types";

type GeocodeSuccessBody = {
  data?: {
    places?: Place[];
  };
};

export type SearchPlacesOptions = {
  /** Current position, so nearby results rank first (FR-032). */
  proximity?: Coordinates | null;
};

export async function searchPlacesFromApi(
  query: string,
  signal?: AbortSignal,
  options: SearchPlacesOptions = {},
): Promise<Place[]> {
  const params = new URLSearchParams({ q: query, locale: "fr" });
  if (options.proximity) {
    params.set("latitude", String(options.proximity.latitude));
    params.set("longitude", String(options.proximity.longitude));
  }

  const response = await fetch(`/api/geocode?${params.toString()}`, { signal });

  if (response.status === 400) {
    return [];
  }

  if (!response.ok) {
    throw new Error("Geocoding request failed");
  }

  const body = (await response.json()) as GeocodeSuccessBody;
  return body.data?.places ?? [];
}
