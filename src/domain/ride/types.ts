import type { Place } from "@/domain/geo/types";

export type RideType = "loop" | "destination" | "round_trip";
export type RideStyle = "curvy" | "scenic" | "touring";

export type RoutePreferences = {
  avoidHighways: boolean;
  avoidUnpaved: boolean;
};

type RideRequestBase = {
  start: Place;
  style: RideStyle;
  preferences: RoutePreferences;
  targetDistanceKm?: number;
  availableDurationMinutes?: number;
};

export type LoopRideRequest = RideRequestBase & {
  type: "loop";
  targetDistanceKm: number;
};

export type DestinationRideRequest = RideRequestBase & {
  type: "destination";
  destination: Place;
};

export type RoundTripRideRequest = RideRequestBase & {
  type: "round_trip";
  destination: Place;
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
