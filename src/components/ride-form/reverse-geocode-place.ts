import type {
  BoundingBox,
  Coordinates,
  Place,
  PlaceType,
} from "@/domain/geo/types";
import { CURRENT_POSITION_FALLBACK_LABEL } from "@/infrastructure/geocoding/labels";

type ReverseGeocodeSuccessBody = {
  data?: {
    place?: unknown;
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
  const place = parseReversePlace(body.data?.place, coordinates);
  if (!place) {
    throw new Error("Reverse geocoding failed");
  }

  return place;
}

function parseReversePlace(
  value: unknown,
  coordinates: Coordinates,
): Place | null {
  if (!isRecord(value)) {
    return null;
  }
  const label = optionalString(value.label);
  if (!label) {
    return null;
  }

  const place: Place = { label, coordinates };
  copyOptionalString(value, place, "id");
  copyOptionalString(value, place, "name");
  copyOptionalString(value, place, "addressLine");
  copyOptionalString(value, place, "fullAddress");
  copyOptionalString(value, place, "locality");
  copyOptionalString(value, place, "region");
  copyOptionalString(value, place, "postalCode");
  copyOptionalString(value, place, "country");
  copyOptionalString(value, place, "countryCode");

  if (isPlaceType(value.type)) {
    place.type = value.type;
  }
  if (value.source === "search" || value.source === "map") {
    place.source = value.source;
  }
  if (value.precision === "exact" || value.precision === "approximate") {
    place.precision = value.precision;
  }
  const bounds = parseBounds(value.bounds);
  if (bounds) {
    place.bounds = bounds;
  }

  return place;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

function copyOptionalString<K extends keyof Place>(
  source: Record<string, unknown>,
  destination: Place,
  key: K,
) {
  const value = optionalString(source[key]);
  if (value) {
    Object.assign(destination, { [key]: value });
  }
}

function isPlaceType(value: unknown): value is PlaceType {
  return (
    value === "address" ||
    value === "city" ||
    value === "postal_code" ||
    value === "place"
  );
}

function parseBounds(value: unknown): BoundingBox | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const west = value.west;
  const south = value.south;
  const east = value.east;
  const north = value.north;
  if (
    typeof west !== "number" ||
    !Number.isFinite(west) ||
    west < -180 ||
    west > 180 ||
    typeof east !== "number" ||
    !Number.isFinite(east) ||
    east < -180 ||
    east > 180 ||
    west > east ||
    typeof south !== "number" ||
    !Number.isFinite(south) ||
    south < -90 ||
    south > 90 ||
    typeof north !== "number" ||
    !Number.isFinite(north) ||
    north < -90 ||
    north > 90 ||
    south > north
  ) {
    return undefined;
  }
  return { west, south, east, north };
}

export function currentPositionFallback(coordinates: Coordinates): Place {
  return {
    label: CURRENT_POSITION_FALLBACK_LABEL,
    coordinates,
  };
}
