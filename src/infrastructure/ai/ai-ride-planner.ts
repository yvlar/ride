import type { Coordinates } from "@/domain/geo/types";
import type {
  AiRouteCandidate,
  DescribedCorrection,
} from "@/domain/ride/ai-route";
import type { RideStyle, RoutePreferences } from "@/domain/ride/types";
import type { WebSearchHit } from "@/infrastructure/search/web-search-provider";

export type DescribedPlanningFailureReason =
  | DescribedCorrection["reason"]
  | "routing_failed"
  | "distance_out_of_tolerance"
  | "no_route_found"
  | "known_unpaved_rejected"
  | "canada_only_rejected"
  | "regeneration_overlap"
  | "insufficient_web_grounding";

export type DescribedPlanningFailure = Omit<DescribedCorrection, "reason"> & {
  reason: DescribedPlanningFailureReason;
  lastDistanceKm?: number;
  triedRoads?: string[];
  searchRadiusKm?: number;
  corridorHint?: string;
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
  triedRoads?: string[];
  searchRadiusKm?: number;
  corridorHint?: string;
  candidateCount?: number;
};

export type AiRidePlan = {
  candidates: AiRouteCandidate[];
};

/**
 * FR-034 — the model selects structured via points; it must not emit a path
 * geometry. The routing adapter produces the navigable trace.
 */
export interface AiRidePlanner {
  planLoop(input: AiRidePlanInput): Promise<AiRidePlan>;
}
