import type { Coordinates } from "@/domain/geo/types";
import type { RideStyle, RoutePreferences } from "@/domain/ride/types";
import type { WebSearchHit } from "@/infrastructure/search/web-search-provider";

export type AiRidePlanInput = {
  origin: Coordinates;
  accuracyMeters: number | null;
  targetDistanceKm: number;
  style?: RideStyle;
  preferences?: RoutePreferences;
  previousRouteSignature?: string;
  searchHits: WebSearchHit[];
  /** FR-034 — false plans a one-way of the requested distance. */
  returnToStart?: boolean;
};

export type AiRidePlan = {
  viaPoints: Coordinates[];
  roads: string[];
  pointsOfInterest: string[];
};

/**
 * FR-034 — the model selects structured via points; it must not emit a path
 * geometry. The routing adapter produces the navigable trace.
 */
export interface AiRidePlanner {
  planLoop(input: AiRidePlanInput): Promise<AiRidePlan>;
}
