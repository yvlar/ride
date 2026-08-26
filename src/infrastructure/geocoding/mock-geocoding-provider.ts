import { haversineKm } from "@/domain/geo/distance";
import type { Coordinates, Place } from "@/domain/geo/types";
import type {
  GeocodingProvider,
  GeocodingSearchOptions,
} from "@/infrastructure/geocoding/geocoding-provider";
import { CURRENT_POSITION_FALLBACK_LABEL } from "@/infrastructure/geocoding/labels";

function mockCity(
  name: string,
  coordinates: Coordinates,
  region = "Québec",
  country = "Canada",
): Place {
  return {
    id: `mock:${name.toLowerCase().replace(/\s+/g, "-")}:${region.toLowerCase()}`,
    label: `${name}, ${region === "Québec" ? "QC" : region}`,
    name,
    region,
    country,
    countryCode: country === "Canada" ? "CA" : undefined,
    type: "city",
    source: "search",
    precision: "approximate",
    coordinates,
  };
}

const MOCK_PLACES: Place[] = [
  {
    id: "mock:125-rue-principale-granby",
    label: "125 Rue Principale, Granby, Québec",
    name: "125 Rue Principale",
    addressLine: "125 Rue Principale",
    fullAddress: "125 Rue Principale, Granby, Québec, J2G 2W4, Canada",
    locality: "Granby",
    region: "Québec",
    postalCode: "J2G 2W4",
    country: "Canada",
    countryCode: "CA",
    type: "address",
    source: "search",
    precision: "exact",
    coordinates: { latitude: 45.4008, longitude: -72.7338 },
  },
  {
    id: "mock:j2g-2w4",
    label: "J2G 2W4, Granby, Québec, Canada",
    name: "J2G 2W4",
    locality: "Granby",
    region: "Québec",
    postalCode: "J2G 2W4",
    country: "Canada",
    countryCode: "CA",
    type: "postal_code",
    source: "search",
    precision: "approximate",
    bounds: {
      west: -72.75,
      south: 45.39,
      east: -72.72,
      north: 45.41,
    },
    coordinates: { latitude: 45.4, longitude: -72.735 },
  },
  mockCity("Granby", { latitude: 45.4001, longitude: -72.7342 }),
  {
    ...mockCity("Mont-Tremblant", {
      latitude: 46.1185,
      longitude: -74.5962,
    }),
  },
  mockCity("Montréal", { latitude: 45.5019, longitude: -73.5674 }),
  mockCity("Québec", { latitude: 46.8139, longitude: -71.208 }),
  mockCity("Magog", { latitude: 45.2668, longitude: -72.1478 }),
  mockCity("Sherbrooke", { latitude: 45.4042, longitude: -71.8929 }),
  mockCity("Sutton", { latitude: 45.071, longitude: -72.616 }),
  mockCity("Bromont", { latitude: 45.318, longitude: -72.652 }),
  mockCity("Baie-Saint-Paul", { latitude: 47.441, longitude: -70.498 }),
  mockCity("Tadoussac", { latitude: 48.143, longitude: -69.715 }),
  mockCity("Percé", { latitude: 48.524, longitude: -64.215 }),
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

export class MockGeocodingProvider implements GeocodingProvider {
  async search(
    query: string,
    locale: string,
    options?: GeocodingSearchOptions,
  ): Promise<Place[]> {
    void locale;
    void options;
    const needle = normalize(query);
    if (needle.length < MIN_QUERY_LENGTH) {
      return [];
    }

    return MOCK_PLACES.filter((place) =>
      normalize(place.label).includes(needle),
    ).slice(0, MAX_RESULTS);
  }

  async reverse(coordinates: Coordinates, locale: string): Promise<Place> {
    void locale;
    const nearest = nearestMockPlace(coordinates);
    return {
      ...(nearest ?? {}),
      label: nearest?.label ?? CURRENT_POSITION_FALLBACK_LABEL,
      coordinates,
      source: "map",
    };
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
