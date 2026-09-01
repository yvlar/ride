import { z } from "zod";
import { joinPlaceLabelParts } from "@/domain/geo/place-display";
import type { BoundingBox, Coordinates, Place } from "@/domain/geo/types";
import { normalizeCanadianPostalCode } from "@/domain/postal-codes/normalize-postal-code";
import { dedupePlaces } from "@/domain/search/dedupe-places";
import { classifyDestinationQuery } from "@/domain/search/query-classification";
import type {
  GeocodeSearchOptions,
  GeocodingProvider,
} from "./geocoding-provider";
import {
  classifyPhotonPlace,
  parsePhotonExtent,
  photonPrecision,
} from "./photon-classification";

export const PHOTON_REQUEST_TIMEOUT_MS = 7_000;
/**
 * Photon's public instance. Keyless and built for typeahead, so the search
 * works with no configuration; `GEOCODING_API_BASE_URL` points at a
 * self-hosted instance for heavier use (BR-004, NFR-005).
 */
export const PHOTON_BASE_URL = "https://photon.komoot.io/";

const PHOTON_USER_AGENT = "Ride/1.0 (+https://github.com/yvlar/ride)";
const MAX_SEARCH_RESULTS = 8;

/**
 * Photon answers HTTP 400 for any other language, and `locale` reaches the
 * adapter from a query parameter, so an unguarded pass-through would turn a
 * stray locale into a failed search.
 */
const PHOTON_LANGUAGES = new Set(["de", "en", "fr", "it"]);

/**
 * Photon returns one row per OSM object, so a street arrives as several
 * segments. Over-fetching leaves a full list once the duplicates are collapsed
 * downstream (`dedupePlaces`).
 */
const OVER_FETCH_FACTOR = 2;
const MAX_PROVIDER_RESULTS = 20;

const photonPropertiesSchema = z
  .object({
    osm_type: z.string().optional(),
    osm_id: z.union([z.string(), z.number()]).optional(),
    osm_key: z.string().optional(),
    osm_value: z.string().optional(),
    type: z.string().optional(),
    name: z.string().optional(),
    housenumber: z.string().optional(),
    street: z.string().optional(),
    city: z.string().optional(),
    district: z.string().optional(),
    county: z.string().optional(),
    state: z.string().optional(),
    postcode: z.string().optional(),
    country: z.string().optional(),
    countrycode: z.string().optional(),
    extent: z.array(z.number()).optional(),
  })
  .passthrough();

type PhotonProperties = z.infer<typeof photonPropertiesSchema>;

const photonFeatureSchema = z.object({
  // GeoJSON order: [longitude, latitude].
  geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
  properties: photonPropertiesSchema,
});

type PhotonFeature = z.infer<typeof photonFeatureSchema>;

const photonCollectionSchema = z.object({
  features: z.array(photonFeatureSchema),
});

/**
 * Photon adapter (BR-004, NFR-005). Photon indexes OSM in ElasticSearch, so it
 * answers partial words — "drummondv", "722 rue des boul roxton" — which a
 * strict forward geocoder cannot. That is what makes it usable as the rider
 * types.
 */
export class PhotonGeocodingProvider implements GeocodingProvider {
  private readonly baseUrl: URL;

  constructor(
    baseUrl: string = PHOTON_BASE_URL,
    private readonly fetcher: typeof fetch = fetch,
    private readonly apiKey?: string,
    private readonly timeoutMs = PHOTON_REQUEST_TIMEOUT_MS,
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
      return this.searchPostalCode(classified, locale, options);
    }

    const url = this.searchUrl(locale, options);
    url.searchParams.set("q", classified.query);
    const features = await this.runSearch(url);
    return features.map((feature) => toPlace(feature, "search"));
  }

  private async searchPostalCode(
    classified: Extract<
      ReturnType<typeof classifyDestinationQuery>,
      { kind: "postal_code" }
    >,
    locale: string,
    options: GeocodeSearchOptions,
  ): Promise<Place[]> {
    if (!classified.areaOnly) {
      const exactUrl = this.searchUrl(locale, options);
      exactUrl.searchParams.set("q", classified.normalized);
      const exact = (await this.runSearch(exactUrl)).filter(
        (feature) =>
          normalizeCanadianPostalCode(postalCodeOf(feature.properties) ?? "") ===
          normalizeCanadianPostalCode(classified.normalized),
      );
      if (exact.length > 0) {
        return exact.map((feature) => toPlace(feature, "search"));
      }
    }

    // Photon fuzzy-matches postal codes: asked for `J2G 2W4` it offers
    // `J2C 2W8`, a different town entirely. A wrong code is not an approximate
    // answer, so anything that is not the requested code is dropped and the
    // forward sortation area is asked for instead (FR-038).
    const areaUrl = this.searchUrl(locale, options);
    areaUrl.searchParams.set("q", classified.fsa);
    const displayed = classified.areaOnly
      ? classified.fsa
      : classified.normalized;

    const area = (await this.runSearch(areaUrl))
      .filter((feature) =>
        compactPostalCode(postalCodeOf(feature.properties)).startsWith(
          classified.fsa,
        ),
      )
      .map((feature) => {
        const place = toPlace(feature, "search");
        // Every `J2G *` code in the area answers the same question, so they are
        // rewritten to the code the rider typed and collapse into one offer.
        return {
          ...place,
          kind: "postal_code" as const,
          precision: "approximate" as const,
          postalCode: displayed,
          name: displayed,
          label: joinPlaceLabelParts([
            displayed,
            place.locality,
            place.region,
            place.country,
          ]),
        };
      });

    return dedupePlaces(area);
  }

  async reverse(coordinates: Coordinates, locale: string): Promise<Place> {
    const url = new URL("reverse", this.baseUrl);
    url.searchParams.set("lat", String(coordinates.latitude));
    url.searchParams.set("lon", String(coordinates.longitude));
    setLanguage(url, locale);

    const features = await this.runSearch(url);
    const nearest = features.at(0);
    if (!nearest) {
      throw new Error("Aucun lieu trouvé pour ces coordonnées.");
    }

    // The rider's own point wins over the matched object's centre (FR-017).
    return { ...toPlace(nearest, "map"), coordinates };
  }

  private searchUrl(locale: string, options: GeocodeSearchOptions): URL {
    const url = new URL("api", this.baseUrl);
    url.searchParams.set(
      "limit",
      String(
        Math.min(
          (options.limit ?? MAX_SEARCH_RESULTS) * OVER_FETCH_FACTOR,
          MAX_PROVIDER_RESULTS,
        ),
      ),
    );
    setLanguage(url, locale);

    const proximity = options.proximity;
    if (proximity) {
      // `lat`/`lon` bias the ranking; they never filter. A destination a
      // province away still comes back (FR-032), which is why
      // `location_bias_scale` is deliberately left at its default — raising it
      // starts pushing distant matches out of the window.
      url.searchParams.set("lat", String(proximity.latitude));
      url.searchParams.set("lon", String(proximity.longitude));
    }

    return url;
  }

  private async runSearch(url: URL): Promise<PhotonFeature[]> {
    const payload = await this.request(url);
    const parsed = photonCollectionSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error("Réponse de géocodage invalide.");
    }
    return parsed.data.features;
  }

  private async request(url: URL): Promise<unknown> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": PHOTON_USER_AGENT,
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

function setLanguage(url: URL, locale: string): void {
  const language = locale.trim().slice(0, 2).toLowerCase();
  if (PHOTON_LANGUAGES.has(language)) {
    url.searchParams.set("lang", language);
  }
}

/**
 * A postcode feature carries the code in `name` and has no `postcode` field of
 * its own; every other feature carries it in `postcode`.
 */
function postalCodeOf(properties: PhotonProperties): string | undefined {
  const value =
    properties.osm_value?.toLowerCase() === "postcode"
      ? properties.name
      : properties.postcode;
  return value?.trim() || undefined;
}

function compactPostalCode(value: string | undefined): string {
  return (value ?? "").replace(/[\s-]/g, "").toUpperCase();
}

function photonParts(properties: PhotonProperties): {
  name?: string;
  addressLine?: string;
  locality?: string;
  region?: string;
  postalCode?: string;
  country?: string;
} {
  const street = [properties.housenumber, properties.street]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ");
  const locality = (
    properties.city ??
    properties.district ??
    properties.county
  )?.trim();
  const name = properties.name?.trim() || street || locality;

  return {
    name: name || undefined,
    addressLine: street && street !== name ? street : undefined,
    locality: locality && locality !== name ? locality : undefined,
    region: properties.state?.trim() || undefined,
    postalCode: postalCodeOf(properties),
    country: properties.country?.trim() || undefined,
  };
}

function toPlace(feature: PhotonFeature, source: "search" | "map"): Place {
  const properties = feature.properties;
  const parts = photonParts(properties);
  const hasHouseNumber = Boolean(properties.housenumber?.trim());
  const kind = classifyPhotonPlace({
    osmKey: properties.osm_key,
    osmValue: properties.osm_value,
    type: properties.type,
    hasHouseNumber,
  });
  const bounds: BoundingBox | null = parsePhotonExtent(properties.extent);
  const [longitude, latitude] = feature.geometry.coordinates;

  // A postal-code result reads best as "J0E 1Z0" over "Roxton Pond": the code
  // is the identity, the municipality is the disambiguator.
  const name =
    kind === "postal_code" && parts.postalCode ? parts.postalCode : parts.name;
  const label =
    joinPlaceLabelParts([
      name,
      parts.addressLine,
      parts.locality,
      parts.region,
      parts.country,
    ]) ||
    // Photon has no `display_name`, so the last resort is whatever field the
    // feature did carry.
    name ||
    parts.locality ||
    parts.region ||
    parts.country ||
    "";

  const id =
    properties.osm_type !== undefined && properties.osm_id !== undefined
      ? `${properties.osm_type}${properties.osm_id}`
      : undefined;

  return {
    label,
    coordinates: { latitude, longitude },
    kind,
    precision: photonPrecision(kind, {
      hasHouseNumber,
      type: properties.type,
    }),
    source,
    ...(id ? { id } : {}),
    ...(name ? { name } : {}),
    ...(parts.addressLine ? { addressLine: parts.addressLine } : {}),
    ...(parts.locality ? { locality: parts.locality } : {}),
    ...(parts.region ? { region: parts.region } : {}),
    ...(parts.postalCode ? { postalCode: parts.postalCode } : {}),
    ...(parts.country ? { country: parts.country } : {}),
    ...(bounds ? { bounds } : {}),
  };
}
