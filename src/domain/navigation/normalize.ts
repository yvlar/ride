import { positionToCoordinates } from "@/domain/geo/distance";
import type { Coordinates, LineString } from "@/domain/geo/types";
import { GENERIC_CONTINUE_INSTRUCTION } from "./constants";
import type {
  DrivingSide,
  NavigationManeuverModifier,
  NavigationManeuverType,
  NavigationStep,
} from "./types";

/**
 * Provider-agnostic draft. Adapters copy vendor fields here so the domain
 * never imports a named routing type (FR-024, BR-004).
 */
export type NavigationStepDraft = {
  type?: string | null;
  modifier?: string | null;
  location?: Coordinates | null;
  bearingBeforeDeg?: number | null;
  bearingAfterDeg?: number | null;
  exit?: number | null;
  name?: string | null;
  ref?: string | null;
  destinations?: string | null;
  rotaryName?: string | null;
  drivingSide?: string | null;
  distanceKm: number;
  durationMinutes: number;
  geometry: LineString;
};

const MANEUVER_ALIASES: Record<string, NavigationManeuverType> = {
  depart: "depart",
  arrive: "arrive",
  continue: "continue",
  turn: "turn",
  uturn: "uturn",
  "u-turn": "uturn",
  fork: "fork",
  merge: "merge",
  "on ramp": "on_ramp",
  on_ramp: "on_ramp",
  onramp: "on_ramp",
  "off ramp": "off_ramp",
  off_ramp: "off_ramp",
  offramp: "off_ramp",
  "end of road": "end_of_road",
  end_of_road: "end_of_road",
  roundabout: "roundabout",
  rotary: "roundabout",
  "roundabout turn": "roundabout",
  "exit roundabout": "roundabout",
  "exit rotary": "roundabout",
  "new name": "new_name",
  new_name: "new_name",
  notification: "continue",
};

const MODIFIER_ALIASES: Record<string, NavigationManeuverModifier> = {
  left: "left",
  right: "right",
  "sharp left": "sharp_left",
  sharp_left: "sharp_left",
  "sharp right": "sharp_right",
  sharp_right: "sharp_right",
  "slight left": "slight_left",
  slight_left: "slight_left",
  "slight right": "slight_right",
  slight_right: "slight_right",
  straight: "straight",
  uturn: "uturn",
  "u-turn": "uturn",
};

export function normalizeManeuverType(
  raw: string | null | undefined,
): NavigationManeuverType {
  if (!raw) {
    return "continue";
  }
  return MANEUVER_ALIASES[raw.trim().toLowerCase()] ?? "unknown";
}

export function normalizeManeuverModifier(
  raw: string | null | undefined,
): NavigationManeuverModifier {
  if (!raw) {
    return "unknown";
  }
  return MODIFIER_ALIASES[raw.trim().toLowerCase()] ?? "unknown";
}

export function normalizeDrivingSide(
  raw: string | null | undefined,
): DrivingSide | undefined {
  const value = raw?.trim().toLowerCase();
  return value === "left" || value === "right" ? value : undefined;
}

export function normalizeNavigationStep(
  draft: NavigationStepDraft,
  index: number,
): NavigationStep {
  const geometry = draft.geometry;
  const fallback = geometry.coordinates[0]
    ? positionToCoordinates(geometry.coordinates[0])
    : { latitude: 0, longitude: 0 };
  let maneuverType = normalizeManeuverType(draft.type);
  const modifier = normalizeManeuverModifier(draft.modifier);
  if (maneuverType === "turn" && modifier === "uturn") {
    maneuverType = "uturn";
  }

  return {
    id: `step:${index}:${maneuverType}`,
    maneuverType,
    modifier,
    location: draft.location ?? fallback,
    bearingBeforeDeg: finiteNumber(draft.bearingBeforeDeg),
    bearingAfterDeg: finiteNumber(draft.bearingAfterDeg),
    exit: finitePositiveInt(draft.exit),
    name: trimToUndefined(draft.name),
    ref: trimToUndefined(draft.ref),
    destinations: trimToUndefined(draft.destinations),
    rotaryName: trimToUndefined(draft.rotaryName),
    drivingSide: normalizeDrivingSide(draft.drivingSide),
    distanceKm: Math.max(0, draft.distanceKm),
    durationMinutes: Math.max(0, draft.durationMinutes),
    geometry,
  };
}

export function unknownManeuverFallbackInstruction(): string {
  return GENERIC_CONTINUE_INSTRUCTION;
}

function trimToUndefined(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function finiteNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function finitePositiveInt(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}
