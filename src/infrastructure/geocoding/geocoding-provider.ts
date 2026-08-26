import type { Coordinates, Place } from "@/domain/geo/types";

export type GeocodingSearchOptions = {
  /** Soft geographic bias only; results outside this area remain eligible. */
  proximity?: Coordinates;
};

export interface GeocodingProvider {
  search(
    query: string,
    locale: string,
    options?: GeocodingSearchOptions,
  ): Promise<Place[]>;
  reverse(coordinates: Coordinates, locale: string): Promise<Place>;
}
