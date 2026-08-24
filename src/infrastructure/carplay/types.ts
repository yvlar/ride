import type {
  NavigationManeuverModifier,
  NavigationManeuverType,
} from "@/domain/navigation/types";

export type CarPlayCoordinate = {
  latitude: number;
  longitude: number;
};

export type CarPlayManeuverSnapshot = {
  instruction: string;
  roadLabel?: string;
  distanceToManeuverM: number;
  maneuverType: NavigationManeuverType;
  modifier: NavigationManeuverModifier;
};

export type CarPlaySessionSnapshot = {
  coordinates: CarPlayCoordinate[];
  userLocation: CarPlayCoordinate | null;
  headingDeg: number | null;
  remainingDistanceKm: number;
  remainingDurationMinutes: number;
  muted: boolean;
  lowAccuracy: boolean;
  maneuver: CarPlayManeuverSnapshot | null;
  speakText: string | null;
};

export type CarPlayConnection = {
  connected: boolean;
  ownsVoice: boolean;
};

export type CarPlayDisplayEvent =
  | { type: "connection"; connected: boolean }
  | { type: "mute"; muted: boolean };
