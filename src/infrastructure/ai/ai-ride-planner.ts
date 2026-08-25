import type { Coordinates } from "@/domain/geo/types";
import type { RideStyle, RoutePreferences } from "@/domain/ride/types";
import type { WebSearchHit } from "@/infrastructure/search/web-search-provider";

export type DescribedPlanningFailureReason =
  | "unusable_via_points"
  | "routing_failed"
  | "distance_out_of_tolerance"
  | "geometric_loop_rejected"
  | "no_route_found"
  | "known_unpaved_rejected"
  | "canada_only_rejected"
  | "regeneration_overlap";

export type DescribedPlanningFailure = {
  reason: DescribedPlanningFailureReason;
  lastDistanceKm?: number;
};

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
  /** FR-034 — why the previous AI plan did not yield a usable road-network ride. */
  previousPlanningFailure?: DescribedPlanningFailure;
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
