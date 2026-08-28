import { haversineKm } from "@/domain/geo/distance";
import type { Coordinates, Place } from "@/domain/geo/types";
import { classifyDestinationQuery } from "@/domain/search/query-classification";
import type {
  GeocodeSearchOptions,
  GeocodingProvider,
} from "@/infrastructure/geocoding/geocoding-provider";
import { CURRENT_POSITION_FALLBACK_LABEL } from "@/infrastructure/geocoding/labels";

/**
 * Deterministic fixtures for local development and tests. They deliberately
 * include the four destination kinds of FR-038 and a pair of same-name
 * municipalities, so the disambiguation rules are exercised without a network
 * provider.
 */
const MOCK_PLACES: Place[] = [
  {
    label: "Granby, Québec, Canada",
    name: "Granby",
    locality: "Granby",
    region: "Québec",
    country: "Canada",
    kind: "city",
    precision: "approximate",
    coordinates: { latitude: 45.4001, longitude: -72.7342 },
  },
  {
    label: "Granby, Colorado, États-Unis",
    name: "Granby",
    locality: "Granby",
    region: "Colorado",
    country: "États-Unis",
    kind: "city",
    precision: "approximate",
    coordinates: { latitude: 40.0866, longitude: -105.9372 },
  },
  {
    label: "125 Rue Principale, Granby, Québec, Canada",
    name: "125 Rue Principale",
    addressLine: "125 Rue Principale",
    locality: "Granby",
    region: "Québec",
    postalCode: "J2G 2W4",
    country: "Canada",
    kind: "address",
    precision: "exact",
    coordinates: { latitude: 45.4008, longitude: -72.7311 },
  },
  {
    label: "J2G 2W4, Granby, Québec, Canada",
    name: "J2G 2W4",
    locality: "Granby",
    region: "Québec",
    postalCode: "J2G 2W4",
    country: "Canada",
    kind: "postal_code",
    precision: "approximate",
    coordinates: { latitude: 45.4004, longitude: -72.7325 },
  },
  {
    label: "Roxton Pond, Québec, Canada",
    name: "Roxton Pond",
    locality: "Roxton Pond",
    region: "Québec",
    country: "Canada",
    kind: "city",
    precision: "approximate",
    coordinates: { latitude: 45.4833, longitude: -72.6333 },
  },
  {
    label: "Mont-Tremblant, Québec, Canada",
    name: "Mont-Tremblant",
    locality: "Mont-Tremblant",
    region: "Québec",
    country: "Canada",
    kind: "city",
    precision: "approximate",
    coordinates: { latitude: 46.1185, longitude: -74.5962 },
  },
  {
    label: "Montréal, Québec, Canada",
    name: "Montréal",
    locality: "Montréal",
    region: "Québec",
    country: "Canada",
    kind: "city",
    precision: "approximate",
    coordinates: { latitude: 45.5019, longitude: -73.5674 },
  },
  {
    label: "Québec, Québec, Canada",
    name: "Québec",
    locality: "Québec",
    region: "Québec",
    country: "Canada",
    kind: "city",
    precision: "approximate",
    coordinates: { latitude: 46.8139, longitude: -71.208 },
  },
  {
    label: "Magog, Québec, Canada",
    name: "Magog",
    locality: "Magog",
    region: "Québec",
    country: "Canada",
    kind: "city",
    precision: "approximate",
    coordinates: { latitude: 45.2668, longitude: -72.1478 },
  },
  {
    label: "Sherbrooke, Québec, Canada",
    name: "Sherbrooke",
    locality: "Sherbrooke",
    region: "Québec",
    country: "Canada",
    kind: "city",
    precision: "approximate",
    coordinates: { latitude: 45.4042, longitude: -71.8929 },
  },
  {
    label: "Sutton, Québec, Canada",
    name: "Sutton",
    locality: "Sutton",
    region: "Québec",
    country: "Canada",
    kind: "city",
    precision: "approximate",
    coordinates: { latitude: 45.071, longitude: -72.616 },
  },
  {
    label: "Bromont, Québec, Canada",
    name: "Bromont",
    locality: "Bromont",
    region: "Québec",
    country: "Canada",
    kind: "city",
    precision: "approximate",
    coordinates: { latitude: 45.318, longitude: -72.652 },
  },
  {
    label: "Baie-Saint-Paul, Québec, Canada",
    name: "Baie-Saint-Paul",
    locality: "Baie-Saint-Paul",
    region: "Québec",
    country: "Canada",
    kind: "city",
    precision: "approximate",
    coordinates: { latitude: 47.441, longitude: -70.498 },
  },
  {
    label: "Tadoussac, Québec, Canada",
    name: "Tadoussac",
    locality: "Tadoussac",
    region: "Québec",
    country: "Canada",
    kind: "city",
    precision: "approximate",
    coordinates: { latitude: 48.143, longitude: -69.715 },
  },
  {
    label: "Percé, Québec, Canada",
    name: "Percé",
    locality: "Percé",
    region: "Québec",
    country: "Canada",
    kind: "city",
    precision: "approximate",
    coordinates: { latitude: 48.524, longitude: -64.215 },
  },
  {
    label: "Parc national du Mont-Orford, Québec, Canada",
    name: "Parc national du Mont-Orford",
    locality: "Orford",
    region: "Québec",
    country: "Canada",
    kind: "place",
    precision: "exact",
    coordinates: { latitude: 45.3167, longitude: -72.2167 },
  },
];

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 8;
const NEAREST_PLACE_MAX_KM = 30;

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function searchableText(place: Place): string {
  return normalize(
    [place.label, place.name, place.locality, place.postalCode]
      .filter((part): part is string => Boolean(part))
      .join(" "),
  );
}

export class MockGeocodingProvider implements GeocodingProvider {
  async search(
    query: string,
    locale: string,
    options: GeocodeSearchOptions = {},
  ): Promise<Place[]> {
    void locale;
    const classified = classifyDestinationQuery(query);

    if (classified.kind === "postal_code") {
      const exact = MOCK_PLACES.filter(
        (place) =>
          place.kind === "postal_code" &&
          normalize(place.postalCode ?? "") ===
            normalize(classified.normalized),
      );
      if (exact.length > 0) {
        return exact.slice(0, options.limit ?? MAX_RESULTS);
      }
      // Forward sortation area fallback, marked approximate (FR-038).
      return MOCK_PLACES.filter((place) =>
        normalize(place.postalCode ?? "").startsWith(
          normalize(classified.fsa),
        ),
      )
        .slice(0, options.limit ?? MAX_RESULTS)
        .map((place) => ({
          ...place,
          kind: "postal_code" as const,
          precision: "approximate" as const,
          postalCode: classified.areaOnly
            ? classified.fsa
            : classified.normalized,
        }));
    }

    const needle = normalize(classified.query);
    if (needle.length < MIN_QUERY_LENGTH) {
      return [];
    }

    return MOCK_PLACES.filter((place) =>
      searchableText(place).includes(needle),
    ).slice(0, options.limit ?? MAX_RESULTS);
  }

  async reverse(coordinates: Coordinates, locale: string): Promise<Place> {
    void locale;
    const nearest = nearestMockPlace(coordinates);
    if (!nearest) {
      return {
        label: CURRENT_POSITION_FALLBACK_LABEL,
        coordinates,
      };
    }
    return { ...nearest, coordinates };
  }
}

function nearestMockPlace(coordinates: Coordinates): Place | undefined {
  return MOCK_PLACES.reduce<{ place?: Place; distanceKm: number }>(
    (best, place) => {
      const distanceKm = haversineKm(coordinates, place.coordinates);
      if (distanceKm > NEAREST_PLACE_MAX_KM || distanceKm >= best.distanceKm) {
        return best;
      }
      return { place, distanceKm };
    },
    { distanceKm: Number.POSITIVE_INFINITY },
  ).place;
}

export const mockGeocodingProvider = new MockGeocodingProvider();

export const MOCK_GEOCODING_MIN_QUERY_LENGTH = MIN_QUERY_LENGTH;
