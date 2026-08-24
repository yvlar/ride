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
  routeId: string;
  coordinates: CarPlayCoordinate[];
  userLocation: CarPlayCoordinate | null;
  headingDeg: number | null;
  remainingDistanceKm: number;
  remainingDurationMinutes: number;
  muted: boolean;
  lowAccuracy: boolean;
  cancelSpeech: boolean;
  maneuver: CarPlayManeuverSnapshot | null;
  speakText: string | null;
};

export type CarPlayConnection = {
  connected: boolean;
  ownsVoice: boolean;
};

export type CarPlayCatalogItem = {
  id: string;
  title: string;
  subtitle?: string;
};

/** Known places / saved rides for CPListTemplate and CPSearchTemplate (FR-028). */
export type CarPlayCatalog = {
  recents: CarPlayCatalogItem[];
  favorites: CarPlayCatalogItem[];
  resumeTitle?: string;
  resumeSubtitle?: string;
};

export type CarPlayDisplayEvent =
  | { type: "connection"; connected: boolean }
  | { type: "mute"; muted: boolean }
  | { type: "stop" }
  | { type: "catalogSelect"; id: string }
  | { type: "searchQuery"; query: string };
