import type { Coordinates, Place } from "@/domain/geo/types";

export interface GeocodingProvider {
  search(query: string, locale: string): Promise<Place[]>;
  reverse(coordinates: Coordinates, locale: string): Promise<Place>;
}
