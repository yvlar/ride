import type { Coordinates, Place } from "@/domain/geo/types";

export type GeocodeSearchOptions = {
  /**
   * Current position, when known. Adapters use it as a soft bias; ranking by
   * distance stays in the domain (`rankPlaces`).
   */
  proximity?: Coordinates | null;
  limit?: number;
};

export interface GeocodingProvider {
  search(
    query: string,
    locale: string,
    options?: GeocodeSearchOptions,
  ): Promise<Place[]>;
  reverse(coordinates: Coordinates, locale: string): Promise<Place>;
}
