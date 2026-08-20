import type { Coordinates, LineString, Place } from "@/domain/geo/types";

export type RideStyle = "curvy" | "scenic" | "touring";

export type LoopRideRequest = {
  type: "loop";
  start: Place;
  targetDistanceKm?: number;
  availableDurationMinutes?: number;
  style?: RideStyle;
};

export type RouteSegment = {
  id: string;
  geometry: LineString;
  distanceKm: number;
  durationMinutes: number;
  roadName?: string;
  surface?: "paved" | "unpaved" | "unknown";
  roadClass?: string;
};

export type LoopRouteStatistics = {
  repeatedRoadPercent: number;
};

export type GeneratedLoopRoute = {
  id: string;
  type: "loop";
  start: Place;
  targetDistanceKm: number;
  geometry: LineString;
  segments: RouteSegment[];
  distanceKm: number;
  durationMinutes: number;
  statistics: LoopRouteStatistics;
  warnings: string[];
};

export type RideGenerationErrorCode =
  | "VALIDATION_ERROR"
  | "UNSUPPORTED_RIDE_TYPE"
  | "NO_ROUTE_FOUND"
  | "DISTANCE_OUT_OF_TOLERANCE"
  | "GEOMETRIC_LOOP_REJECTED";

export type RideGenerationError = {
  code: RideGenerationErrorCode;
  message: string;
  suggestions: string[];
  bestCandidate?: {
    distanceKm: number;
    repeatedRoadPercent: number;
  };
};

export type LoopCandidate = {
  geometry: LineString;
  segments: RouteSegment[];
  distanceKm: number;
  durationMinutes: number;
  waypoints: Coordinates[];
};
