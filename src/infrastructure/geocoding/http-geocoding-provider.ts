import { z } from "zod";
import type { BoundingBox, Coordinates, Place } from "@/domain/geo/types";
import { classifyDestinationQuery } from "@/domain/search/query-classification";
import type {
  GeocodeSearchOptions,
  GeocodingProvider,
} from "./geocoding-provider";
import {
  classifyNominatimPlace,
  nominatimPrecision,
  parseNominatimBoundingBox,
} from "./nominatim-classification";

export const GEOCODING_REQUEST_TIMEOUT_MS = 7_000;
const GEOCODING_USER_AGENT = "Ride/1.0 (+https://github.com/yvlar/ride)";
const MAX_SEARCH_RESULTS = 8;

/**
 * Half-width of the `viewbox` biasing box around the rider, in degrees.
 * Roughly 110 km of latitude — wide enough to favour nearby results without
 * hiding a destination a province away.
 */
const PROXIMITY_VIEWBOX_DEGREES = 1;

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
  display_name: z.string().min(1),
  name: z.string().optional(),
  lat: z.union([z.string(), z.number()]),
  lon: z.union([z.string(), z.number()]),
  place_id: z.union([z.string(), z.number()]).optional(),
  category: z.string().optional(),
  class: z.string().optional(),
  type: z.string().optional(),
  addresstype: z.string().optional(),
  place_rank: z.union([z.string(), z.number()]).optional(),
  boundingbox: z.array(z.union([z.string(), z.number()])).optional(),
  address: nominatimAddressSchema.optional(),
});

type NominatimPlace = z.infer<typeof nominatimPlaceSchema>;

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
    options: GeocodeSearchOptions = {},
  ): Promise<Place[]> {
    const classified = classifyDestinationQuery(query);

    if (classified.kind === "postal_code") {
      const exact = classified.areaOnly
        ? []
        : await this.searchPostalCode(classified.normalized, locale, options);
      if (exact.length > 0) {
        return exact;
      }
      // OSM rarely carries a full Canadian postal code (LDU). Falling back to
      // the forward sortation area still puts the rider in the right area,
      // flagged approximate so the marker can be adjusted (FR-038).
      const area = await this.searchPostalCode(classified.fsa, locale, options);
      return area.map((place) => ({
        ...place,
        kind: "postal_code" as const,
        precision: "approximate" as const,
        postalCode: classified.areaOnly
          ? classified.fsa
          : classified.normalized,
      }));
    }

    const url = this.searchUrl(locale, options);
    url.searchParams.set("q", classified.query);
    return this.runSearch(url);
  }

  private async searchPostalCode(
    postalCode: string,
    locale: string,
    options: GeocodeSearchOptions,
  ): Promise<Place[]> {
    const url = this.searchUrl(locale, options);
    // Structured query: Nominatim matches a postal code far more reliably this
    // way than through free-form `q`.
    url.searchParams.set("postalcode", postalCode);
    url.searchParams.set("countrycodes", "ca");
    const places = await this.runSearch(url);
    return places.map((place) => ({
      ...place,
      postalCode: place.postalCode ?? postalCode,
    }));
  }

  private searchUrl(locale: string, options: GeocodeSearchOptions): URL {
    const url = new URL("search", this.baseUrl);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", String(options.limit ?? MAX_SEARCH_RESULTS));
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", locale);

    const proximity = options.proximity;
    if (proximity) {
      // `viewbox` without `bounded` is a preference, not a filter: results
      // outside the box are still returned (FR-032).
      const west = proximity.longitude - PROXIMITY_VIEWBOX_DEGREES;
      const east = proximity.longitude + PROXIMITY_VIEWBOX_DEGREES;
      const south = proximity.latitude - PROXIMITY_VIEWBOX_DEGREES;
      const north = proximity.latitude + PROXIMITY_VIEWBOX_DEGREES;
      url.searchParams.set("viewbox", `${west},${south},${east},${north}`);
      url.searchParams.set("bounded", "0");
    }

    return url;
  }

  private async runSearch(url: URL): Promise<Place[]> {
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
      return [toPlace(item, coordinates, "search")];
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

function formatPlaceLabel(place: NominatimPlace): string {
  const parts = placeParts(place);
  const labeled = [
    parts.name,
    parts.addressLine,
    parts.locality,
    parts.region,
    parts.country,
  ]
    .filter((part): part is string => Boolean(part))
    .filter((part, index, all) => all.indexOf(part) === index);
  if (labeled.length > 0) {
    return labeled.join(", ");
  }
  return place.display_name;
}

function toPlace(
  place: NominatimPlace,
  coordinates: Coordinates,
  source: "search" | "map",
): Place {
  const parts = placeParts(place);
  const hasHouseNumber = Boolean(place.address?.house_number?.trim());
  const kind = classifyNominatimPlace({
    category: place.category ?? place.class,
    type: place.type,
    addressType: place.addresstype,
    placeRank:
      place.place_rank === undefined ? undefined : Number(place.place_rank),
    hasHouseNumber,
    hasPostalCode: Boolean(place.address?.postcode?.trim()),
  });
  const bounds: BoundingBox | null = parseNominatimBoundingBox(
    place.boundingbox,
  );

  // A postal-code result reads best as "J2G 2W4" over "Granby, Québec": the
  // code is the identity, the municipality is the disambiguator.
  const name =
    kind === "postal_code" && parts.postalCode ? parts.postalCode : parts.name;
  const locality =
    parts.locality ?? (name !== parts.rawLocality ? parts.rawLocality : undefined);

  return {
    label: formatPlaceLabel(place),
    coordinates,
    kind,
    precision: nominatimPrecision(kind, hasHouseNumber),
    source,
    ...(place.place_id !== undefined ? { id: String(place.place_id) } : {}),
    ...(name ? { name } : {}),
    ...(parts.addressLine ? { addressLine: parts.addressLine } : {}),
    ...(locality ? { locality } : {}),
    ...(parts.region ? { region: parts.region } : {}),
    ...(parts.postalCode ? { postalCode: parts.postalCode } : {}),
    ...(parts.country ? { country: parts.country } : {}),
    ...(bounds ? { bounds } : {}),
  };
}

function placeParts(place: NominatimPlace): {
  name?: string;
  addressLine?: string;
  locality?: string;
  /** Municipality before the "same as the name" de-duplication. */
  rawLocality?: string;
  region?: string;
  postalCode?: string;
  country?: string;
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
    rawLocality: locality || undefined,
    region: address?.state?.trim() || undefined,
    postalCode: address?.postcode?.trim() || undefined,
    country: address?.country?.trim() || undefined,
  };
}
