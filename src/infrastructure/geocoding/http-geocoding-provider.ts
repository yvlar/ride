import { z } from "zod";
import type { Coordinates, Place } from "@/domain/geo/types";
import type { GeocodingProvider } from "./geocoding-provider";

export const GEOCODING_REQUEST_TIMEOUT_MS = 7_000;
const GEOCODING_USER_AGENT = "Ride/1.0 (+https://github.com/yvlar/ride)";
const MAX_SEARCH_RESULTS = 8;

const nominatimAddressSchema = z
  .object({
    house_number: z.string().optional(),
    road: z.string().optional(),
    pedestrian: z.string().optional(),
    suburb: z.string().optional(),
    village: z.string().optional(),
    town: z.string().optional(),
    city: z.string().optional(),
    municipality: z.string().optional(),
    city_district: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
  })
  .passthrough();

const nominatimPlaceSchema = z.object({
  display_name: z.string().min(1),
  name: z.string().optional(),
  lat: z.union([z.string(), z.number()]),
  lon: z.union([z.string(), z.number()]),
  address: nominatimAddressSchema.optional(),
});

const nominatimSearchSchema = z.array(nominatimPlaceSchema);
const nominatimErrorSchema = z.object({
  error: z.string(),
});

/**
 * Nominatim-compatible HTTP adapter. The base URL is required and never
 * defaults to a public demonstration server (BR-004, NFR-005).
 */
export class HttpGeocodingProvider implements GeocodingProvider {
  private readonly baseUrl: URL;

  constructor(
    baseUrl: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly apiKey?: string,
    private readonly timeoutMs = GEOCODING_REQUEST_TIMEOUT_MS,
  ) {
    this.baseUrl = parseBaseUrl(baseUrl);
  }

  async search(query: string, locale: string): Promise<Place[]> {
    const url = new URL("search", this.baseUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", String(MAX_SEARCH_RESULTS));
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", locale);

    const payload = await this.request(url);
    const parsed = nominatimSearchSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error("Réponse de géocodage invalide.");
    }

    return parsed.data.flatMap((item) => {
      const coordinates = parseNominatimCoordinates(item.lat, item.lon);
      if (!coordinates) {
        return [];
      }
      return [toPlace(item, coordinates)];
    });
  }

  async reverse(coordinates: Coordinates, locale: string): Promise<Place> {
    const url = new URL("reverse", this.baseUrl);
    url.searchParams.set("lat", String(coordinates.latitude));
    url.searchParams.set("lon", String(coordinates.longitude));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", locale);

    const payload = await this.request(url);
    if (nominatimErrorSchema.safeParse(payload).success) {
      throw new Error("Aucun lieu trouvé pour ces coordonnées.");
    }

    const parsed = nominatimPlaceSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error("Réponse de géocodage invalide.");
    }

    return toPlace(parsed.data, coordinates);
  }

  private async request(url: URL): Promise<unknown> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": GEOCODING_USER_AGENT,
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const response = await this.fetcher(url, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(
        response.ok
          ? "Réponse de géocodage invalide."
          : `Géocodage HTTP ${response.status}`,
      );
    }

    if (!response.ok) {
      throw new Error(`Géocodage HTTP ${response.status}`);
    }

    return payload;
  }
}

function parseBaseUrl(value: string): URL {
  const url = new URL(value.endsWith("/") ? value : `${value}/`);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("GEOCODING_API_BASE_URL doit utiliser HTTP ou HTTPS.");
  }
  return url;
}

function parseNominatimCoordinates(
  lat: string | number,
  lon: string | number,
): Coordinates | null {
  const latitude = typeof lat === "number" ? lat : Number(lat);
  const longitude = typeof lon === "number" ? lon : Number(lon);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return { latitude, longitude };
}

function formatPlaceLabel(place: z.infer<typeof nominatimPlaceSchema>): string {
  const parts = placeParts(place);
  const labeled = [parts.name, parts.addressLine, parts.locality, parts.region]
    .filter((part): part is string => Boolean(part))
    .filter((part, index, all) => all.indexOf(part) === index);
  if (labeled.length > 0) {
    return labeled.join(", ");
  }
  return place.display_name;
}

function toPlace(
  place: z.infer<typeof nominatimPlaceSchema>,
  coordinates: Coordinates,
): Place {
  const parts = placeParts(place);
  return {
    label: formatPlaceLabel(place),
    coordinates,
    ...(parts.name ? { name: parts.name } : {}),
    ...(parts.addressLine ? { addressLine: parts.addressLine } : {}),
    ...(parts.locality ? { locality: parts.locality } : {}),
    ...(parts.region ? { region: parts.region } : {}),
  };
}

function placeParts(place: z.infer<typeof nominatimPlaceSchema>): {
  name?: string;
  addressLine?: string;
  locality?: string;
  region?: string;
} {
  const address = place.address;
  const street = address
    ? [address.house_number, address.road ?? address.pedestrian]
        .filter((part): part is string => Boolean(part?.trim()))
        .join(" ")
    : "";
  const locality = address
    ? (address.city ??
      address.town ??
      address.village ??
      address.municipality ??
      address.suburb ??
      address.city_district)
    : undefined;
  const name = place.name?.trim() || street || locality;
  return {
    name: name || undefined,
    addressLine: street && street !== name ? street : undefined,
    locality: locality && locality !== name ? locality : undefined,
    region: address?.state?.trim() || undefined,
  };
}
