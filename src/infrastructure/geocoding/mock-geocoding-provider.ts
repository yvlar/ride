import { haversineKm } from "@/domain/geo/distance";
import type { Coordinates, Place } from "@/domain/geo/types";
import type { GeocodingProvider } from "@/infrastructure/geocoding/geocoding-provider";
import { CURRENT_POSITION_FALLBACK_LABEL } from "@/infrastructure/geocoding/labels";

const MOCK_PLACES: Place[] = [
  { label: "Granby, QC", coordinates: { latitude: 45.4001, longitude: -72.7342 } },
  {
    label: "Mont-Tremblant, QC",
    coordinates: { latitude: 46.1185, longitude: -74.5962 },
  },
  { label: "Montréal, QC", coordinates: { latitude: 45.5019, longitude: -73.5674 } },
  { label: "Québec, QC", coordinates: { latitude: 46.8139, longitude: -71.208 } },
  { label: "Magog, QC", coordinates: { latitude: 45.2668, longitude: -72.1478 } },
  {
    label: "Sherbrooke, QC",
    coordinates: { latitude: 45.4042, longitude: -71.8929 },
  },
  { label: "Sutton, QC", coordinates: { latitude: 45.071, longitude: -72.616 } },
  { label: "Bromont, QC", coordinates: { latitude: 45.318, longitude: -72.652 } },
  {
    label: "Baie-Saint-Paul, QC",
    coordinates: { latitude: 47.441, longitude: -70.498 },
  },
  { label: "Tadoussac, QC", coordinates: { latitude: 48.143, longitude: -69.715 } },
  { label: "Percé, QC", coordinates: { latitude: 48.524, longitude: -64.215 } },
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
  async search(query: string, locale: string): Promise<Place[]> {
    void locale;
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
      label: nearest?.label ?? CURRENT_POSITION_FALLBACK_LABEL,
      coordinates,
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
