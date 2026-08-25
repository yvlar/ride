import type { Coordinates } from "@/domain/geo/types";
import type { RideStyle, RoutePreferences } from "@/domain/ride/types";

export type WebSearchHit = {
  title: string;
  snippet: string;
};

export type MotorcycleWebSearchInput = {
  origin: Coordinates;
  accuracyMeters: number | null;
  targetDistanceKm: number;
  style?: RideStyle;
  preferences?: RoutePreferences;
  /** FR-034 — false searches for a one-way corridor, not a loop. */
  returnToStart?: boolean;
};

/**
 * FR-034 / BR-004 — replaceable web search port. Hits stay on the server.
 */
export interface WebSearchProvider {
  searchMotorcycleRoads(input: MotorcycleWebSearchInput): Promise<WebSearchHit[]>;
}
