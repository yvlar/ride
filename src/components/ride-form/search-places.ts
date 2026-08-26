import type { Place } from "@/domain/geo/types";
import type { Coordinates } from "@/domain/geo/types";
import { normalizeGeocodingQuery } from "@/domain/geo/canadian-postal-code";

type GeocodeSuccessBody = {
  data?: {
    places?: Place[];
  };
};

export async function searchPlacesFromApi(
  query: string,
  signal?: AbortSignal,
  proximity?: Coordinates,
): Promise<Place[]> {
  const params = new URLSearchParams({
    q: normalizeGeocodingQuery(query),
    locale: "fr",
  });
  if (proximity) {
    params.set("latitude", String(proximity.latitude));
    params.set("longitude", String(proximity.longitude));
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
