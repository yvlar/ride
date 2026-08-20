import type { Coordinates, LineString, Place } from "@/domain/geo/types";

export type RideType = "loop" | "destination" | "round_trip";
export type RideStyle = "curvy" | "scenic" | "touring";

export type RoutePreferences = {
  avoidHighways: boolean;
  avoidUnpaved: boolean;
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
  | "GEOMETRIC_LOOP_REJECTED"
  | "PROVIDER_ERROR";

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
