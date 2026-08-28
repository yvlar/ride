import type { Coordinates, LineString } from "@/domain/geo/types";

/**
 * Provider-agnostic maneuver kinds (FR-024, BR-004).
 * Adapters map vendor strings here; the domain never imports an OSRM type.
 */
export type NavigationManeuverType =
  | "depart"
  | "arrive"
  | "continue"
  | "turn"
  | "uturn"
  | "fork"
  | "merge"
  | "on_ramp"
  | "off_ramp"
  | "end_of_road"
  | "roundabout"
  | "new_name"
  | "unknown";

export type NavigationManeuverModifier =
  | "left"
  | "right"
  | "sharp_left"
  | "sharp_right"
  | "slight_left"
  | "slight_right"
  | "straight"
  | "uturn"
  | "unknown";

export type DrivingSide = "left" | "right";

export type NavigationStep = {
  id: string;
  maneuverType: NavigationManeuverType;
  modifier: NavigationManeuverModifier;
  location: Coordinates;
  bearingBeforeDeg?: number;
  bearingAfterDeg?: number;
  exit?: number;
  name?: string;
  ref?: string;
  destinations?: string;
  rotaryName?: string;
  drivingSide?: DrivingSide;
  distanceKm: number;
  durationMinutes: number;
  geometry: LineString;
};

export type AnnouncementPhase = "prepare" | "approach" | "imminent";

export type VoiceAnnouncementMemory = {
  byStepId: Record<string, AnnouncementPhase[]>;
};

export type LocationFix = {
  coordinates: Coordinates;
  accuracyMeters: number;
  headingDeg?: number;
  speedMetersPerSecond?: number;
  /** Altitude GPS quand l'appareil la fournit, pour `<ele>` à l'export (FR-041). */
  altitudeMeters?: number | null;
  recordedAtMs: number;
};

export type RouteProjection = {
  snapped: Coordinates;
  distanceToRouteM: number;
  progressKm: number;
  remainingDistanceKm: number;
  remainingDurationMinutes: number;
  segmentIndex: number;
  segmentFraction: number;
};

export type NavigationProgress = {
  projection: RouteProjection;
  currentStepIndex: number;
  nextStep: NavigationStep | null;
  /** FR-042 — the maneuver chained right after `nextStep`, shown discreetly. */
  followingStep: NavigationStep | null;
  distanceToNextManeuverM: number;
  remainingDistanceKm: number;
  remainingDurationMinutes: number;
  lowAccuracy: boolean;
};

export type OffRouteDecision = {
  offRoute: boolean;
  shouldRecalculate: boolean;
  reason:
    | "on_route"
    | "low_accuracy"
    | "single_reading"
    | "parallel_or_shortcut"
    | "cooldown"
    | "already_recalculating"
    | "stopped"
    | "persistent_off_route";
};

export type OffRouteTracker = {
  consecutivePreciseOff: number;
  firstOffAtMs: number | null;
  lastRecalculateAtMs: number | null;
  lastProgressKm: number | null;
};
