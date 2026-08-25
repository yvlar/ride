import type { Coordinates, LineString, Place } from "@/domain/geo/types";
import type { NavigationStep } from "@/domain/navigation/types";

export type RideType = "loop" | "destination" | "round_trip";
export type RideStyle = "curvy" | "scenic" | "touring";

/**
 * Provider-agnostic landscape hints. Adapters copy known tags; the domain
 * never infers a named map source (FR-005, BR-004).
 */
export type ScenicLandscapeFeature =
  | "rural"
  | "mountain"
  | "lake"
  | "river"
  | "viewpoint"
  | "village"
  | "panoramic"
  | "industrial";

export type RoutePreferences = {
  avoidHighways: boolean;
  avoidUnpaved: boolean;
  /** FR-030 — omit or false keeps current default (crossings allowed). */
  stayInCanada?: boolean;
};

export type LoopRideRequest = {
  type: "loop";
  start: Place;
  targetDistanceKm?: number;
  availableDurationMinutes?: number;
  style?: RideStyle;
  preferences?: RoutePreferences;
};

export type DestinationRideRequest = {
  type: "destination";
  start: Place;
  destination: Place;
  targetDistanceKm?: number;
  availableDurationMinutes?: number;
  style: RideStyle;
  preferences: RoutePreferences;
};

export type RoundTripRideRequest = {
  type: "round_trip";
  start: Place;
  destination: Place;
  targetDistanceKm?: number;
  availableDurationMinutes?: number;
  style: RideStyle;
  preferences: RoutePreferences;
};

export type GenerateRideRequest =
  | LoopRideRequest
  | DestinationRideRequest
  | RoundTripRideRequest;

export type RideFormInput = {
  start: Place | null;
  type: RideType;
  destination: Place | null;
  targetDistanceKm?: number | null;
  availableDurationMinutes?: number | null;
  style: RideStyle;
  preferences: RoutePreferences;
};

export type RideFormField =
  | "start"
  | "destination"
  | "targetDistanceKm"
  | "availableDurationMinutes"
  | "style"
  | "type";

export type RideFormError = {
  field: RideFormField;
  message: string;
};

export type RouteSegment = {
  id: string;
  geometry: LineString;
  distanceKm: number;
  durationMinutes: number;
  roadName?: string;
  surface?: "paved" | "unpaved" | "unknown";
  roadClass?: string;
  /** Cumulative climb on this segment, when the provider exposes it (FR-004). */
  elevationGainM?: number;
  /** Known landscape tags when the provider exposes them (FR-005). */
  landscapeFeatures?: ScenicLandscapeFeature[];
};

export type LoopRouteStatistics = {
  repeatedRoadPercent: number;
};

export type GeneratedLoopRoute = {
  id: string;
  type: "loop";
  start: Place;
  targetDistanceKm: number;
  style?: RideStyle;
  geometry: LineString;
  segments: RouteSegment[];
  steps?: NavigationStep[];
  distanceKm: number;
  durationMinutes: number;
  statistics: LoopRouteStatistics;
  warnings: string[];
};

export type GeneratedDestinationRoute = {
  id: string;
  type: "destination";
  start: Place;
  destination: Place;
  style: RideStyle;
  targetDistanceKm?: number;
  geometry: LineString;
  segments: RouteSegment[];
  steps?: NavigationStep[];
  distanceKm: number;
  durationMinutes: number;
  warnings: string[];
};

export type RoundTripRouteStatistics = {
  repeatedRoadPercent: number;
  outboundReturnOverlapPercent: number;
};

export type GeneratedRoundTripRoute = {
  id: string;
  type: "round_trip";
  start: Place;
  destination: Place;
  style: RideStyle;
  targetDistanceKm?: number;
  geometry: LineString;
  segments: RouteSegment[];
  steps?: NavigationStep[];
  distanceKm: number;
  durationMinutes: number;
  statistics: RoundTripRouteStatistics;
  warnings: string[];
};

export type GeneratedRideRoute =
  | GeneratedLoopRoute
  | GeneratedDestinationRoute
  | GeneratedRoundTripRoute;

export type RideGenerationErrorCode =
  | "VALIDATION_ERROR"
  | "UNSUPPORTED_RIDE_TYPE"
  | "NO_ROUTE_FOUND"
  | "DISTANCE_OUT_OF_TOLERANCE"
  | "GEOMETRIC_LOOP_REJECTED"
  | "PROVIDER_ERROR"
  | "WEB_SEARCH_UNAVAILABLE"
  | "AI_UNAVAILABLE"
  | "ROUTING_UNAVAILABLE"
  | "STALE_RECALCULATE"
  | "RECALCULATE_IN_PROGRESS";

export type RideGenerationError = {
  code: RideGenerationErrorCode;
  message: string;
  suggestions: string[];
  bestCandidate?: {
    distanceKm: number;
    repeatedRoadPercent?: number;
  };
};

export type GenerateRideResult =
  | { ok: true; route: GeneratedRideRoute }
  | { ok: false; error: RideGenerationError };

/** FR-012 — optional previous corridor used only during regeneration. */
export type RideGenerationOptions = {
  previousGeometry?: LineString;
};

export type LoopCandidate = {
  geometry: LineString;
  segments: RouteSegment[];
  steps?: NavigationStep[];
  distanceKm: number;
  durationMinutes: number;
  waypoints: Coordinates[];
};

export type DestinationCandidate = {
  geometry: LineString;
  segments: RouteSegment[];
  steps?: NavigationStep[];
  distanceKm: number;
  durationMinutes: number;
  waypoints: Coordinates[];
};

export type RoundTripCandidate = {
  outbound: DestinationCandidate;
  inbound: DestinationCandidate;
  geometry: LineString;
  segments: RouteSegment[];
  steps?: NavigationStep[];
  distanceKm: number;
  durationMinutes: number;
};
