import { z } from "zod";
import { normalizeCanadianPostalCode } from "@/domain/geo/canadian-postal-code";
import { haversineKm } from "@/domain/geo/distance";
import type {
  BoundingBox,
  Coordinates,
  Place,
  PlaceType,
} from "@/domain/geo/types";
import type {
  GeocodingProvider,
  GeocodingSearchOptions,
} from "./geocoding-provider";

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
    postcode: z.string().optional(),
    country: z.string().optional(),
    country_code: z.string().optional(),
  })
  .passthrough();

const nominatimPlaceSchema = z.object({
  place_id: z.union([z.string(), z.number()]).optional(),
  display_name: z.string().min(1),
  name: z.string().optional(),
  lat: z.union([z.string(), z.number()]),
  lon: z.union([z.string(), z.number()]),
  class: z.string().optional(),
  type: z.string().optional(),
  addresstype: z.string().optional(),
  boundingbox: z
    .tuple([
      z.union([z.string(), z.number()]),
      z.union([z.string(), z.number()]),
      z.union([z.string(), z.number()]),
      z.union([z.string(), z.number()]),
    ])
    .optional(),
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

  async search(
    query: string,
    locale: string,
    options: GeocodingSearchOptions = {},
  ): Promise<Place[]> {
    const url = new URL("search", this.baseUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", String(MAX_SEARCH_RESULTS));
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", locale);
    if (options.proximity) {
      const { latitude, longitude } = options.proximity;
      const longitudeSpan = 4;
      const latitudeSpan = 3;
      url.searchParams.set(
        "viewbox",
        [
          Math.max(-180, longitude - longitudeSpan),
          Math.min(90, latitude + latitudeSpan),
          Math.min(180, longitude + longitudeSpan),
          Math.max(-90, latitude - latitudeSpan),
        ].join(","),
      );
      // Nominatim uses the viewbox as a preference while bounded=0 keeps
      // places elsewhere in the world searchable.
      url.searchParams.set("bounded", "0");
    }

    const payload = await this.request(url);
    const parsed = nominatimSearchSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error("Réponse de géocodage invalide.");
    }

    const places = parsed.data.flatMap((item) => {
      const coordinates = parseNominatimCoordinates(item.lat, item.lon);
      if (!coordinates) {
        return [];
      }
      return [toPlace(item, coordinates, "search")];
    });
    return rankSearchPlaces(places, options.proximity);
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

    return toPlace(parsed.data, coordinates, "map");
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
  if (url.hostname.toLowerCase() === "nominatim.openstreetmap.org") {
    throw new Error(
      "Le service public nominatim.openstreetmap.org interdit l’autocomplétion. Configurez une instance Nominatim dédiée ou gérée.",
    );
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
  if (placeType(place) === "postal_code" && parts.postalCode) {
    return [
      normalizePostalCode(parts.postalCode, parts.countryCode),
      parts.locality,
      parts.region,
      parts.country,
    ]
      .filter((part): part is string => Boolean(part))
      .filter((part, index, all) => all.indexOf(part) === index)
      .join(", ");
  }
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
  source: "search" | "map",
): Place {
  const parts = placeParts(place);
  const type = placeType(place);
  const postalCode = normalizePostalCode(parts.postalCode, parts.countryCode);
  const bounds = parseNominatimBoundingBox(place.boundingbox);
  return {
    ...(place.place_id !== undefined
      ? { id: `nominatim:${String(place.place_id)}` }
      : {}),
    label: formatPlaceLabel(place),
    coordinates,
    ...(parts.name ? { name: parts.name } : {}),
    ...(parts.addressLine ? { addressLine: parts.addressLine } : {}),
    fullAddress: place.display_name,
    ...(parts.locality ? { locality: parts.locality } : {}),
    ...(parts.region ? { region: parts.region } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(parts.country ? { country: parts.country } : {}),
    ...(parts.countryCode ? { countryCode: parts.countryCode } : {}),
    type,
    source,
    precision: placePrecision(type, Boolean(place.address?.house_number)),
    ...(bounds ? { bounds } : {}),
  };
}

function placeParts(place: z.infer<typeof nominatimPlaceSchema>): {
  name?: string;
  addressLine?: string;
  locality?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  countryCode?: string;
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
    locality: locality || undefined,
    region: address?.state?.trim() || undefined,
    postalCode: address?.postcode?.trim() || undefined,
    country: address?.country?.trim() || undefined,
    countryCode: address?.country_code?.trim().toUpperCase() || undefined,
  };
}

const CITY_ADDRESS_TYPES = new Set([
  "city",
  "town",
  "village",
  "municipality",
  "borough",
]);

function placeType(
  place: z.infer<typeof nominatimPlaceSchema>,
): PlaceType {
  const upstreamType = (place.addresstype ?? place.type ?? "").toLowerCase();
  if (upstreamType.includes("postcode") || upstreamType.includes("postal")) {
    return "postal_code";
  }
  if (CITY_ADDRESS_TYPES.has(upstreamType)) {
    return "city";
  }
  if (
    Boolean(place.address?.house_number) ||
    ["house", "building", "residential", "road", "street"].includes(
      upstreamType,
    )
  ) {
    return "address";
  }
  return "place";
}

function placePrecision(
  type: PlaceType,
  hasHouseNumber: boolean,
): "exact" | "approximate" {
  if (type === "city" || type === "postal_code") {
    return "approximate";
  }
  if (type === "address" && !hasHouseNumber) {
    return "approximate";
  }
  return "exact";
}

function normalizePostalCode(
  value: string | undefined,
  countryCode: string | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }
  if (countryCode?.toUpperCase() !== "CA") {
    return value;
  }
  return normalizeCanadianPostalCode(value) ?? value.toUpperCase();
}

function parseNominatimBoundingBox(
  value: z.infer<typeof nominatimPlaceSchema>["boundingbox"],
): BoundingBox | undefined {
  if (!value) {
    return undefined;
  }
  const [south, north, west, east] = value.map(Number);
  if (
    !Number.isFinite(south) ||
    !Number.isFinite(north) ||
    !Number.isFinite(west) ||
    !Number.isFinite(east) ||
    south! < -90 ||
    north! > 90 ||
    west! < -180 ||
    east! > 180 ||
    south! > north! ||
    west! > east!
  ) {
    return undefined;
  }
  return { south: south!, north: north!, west: west!, east: east! };
}

function rankSearchPlaces(
  places: Place[],
  proximity: Coordinates | undefined,
): Place[] {
  return places
    .map((place, index) => ({
      place,
      index,
      score:
        (place.countryCode === "CA" || place.country === "Canada" ? 100 : 0) +
        (/^(qc|québec|quebec)$/i.test(place.region ?? "") ? 50 : 0) +
        (proximity
          ? Math.max(0, 25 - haversineKm(proximity, place.coordinates) / 25)
          : 0),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ place }) => place);
}
