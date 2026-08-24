import type { Place } from "@/domain/geo/types";

type GeocodeSuccessBody = {
  data?: {
    places?: Place[];
  };
};

export async function searchPlacesFromApi(
  query: string,
  signal?: AbortSignal,
): Promise<Place[]> {
  const response = await fetch(
    `/api/geocode?q=${encodeURIComponent(query)}&locale=fr`,
    { signal },
  );

  if (response.status === 400) {
    return [];
  }

  if (!response.ok) {
    throw new Error("Geocoding request failed");
  }

  const body = (await response.json()) as GeocodeSuccessBody;
  return body.data?.places ?? [];
}
