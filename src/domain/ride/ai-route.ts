import { maxDistanceFromOriginKm } from "@/domain/geo/geometry";
import type { Coordinates, LineString } from "@/domain/geo/types";
import { routeEntersUnitedStates } from "./canada";
import {
  AI_LOOP_MAX_REPEATED_ROAD_PERCENT,
  AI_LOOP_MIN_SPREAD_RATIO,
  AI_LOOP_ORIGIN_CONNECTOR_KM,
  MIN_DESTINATION_ROAD_POINTS,
  MIN_ROAD_NETWORK_POINTS,
} from "./constants";
import { distanceBoundsKm, usesKnownUnpaved } from "./constraints";
import { isClosedLoop, isGeometricCircle } from "./loop";
import { measureRepeatedRoadPercentBeyondOrigin } from "./overlap";
import type { LoopCandidate, RoutePreferences, RouteSegment } from "./types";

export type AiWaypoint = {
  label: string;
  latitude: number;
  longitude: number;
  sourceResultIds: string[];
};

export type AiRouteCandidate = {
  candidateName: string;
  viaPoints: AiWaypoint[];
  roads: string[];
  pointsOfInterest: string[];
};

export type AiRouteViolation =
  | "distance_too_short"
  | "distance_too_long"
  | "insufficient_spread"
  | "repeated_road"
  | "unroutable_waypoint"
  | "not_closed"
  | "unpaved_rejected"
  | "highway_rejected"
  | "canada_only_rejected";

export type NamedSearchNote = {
  id: string;
  title: string;
  snippet: string;
};

export type RouteCandidateEvaluation = {
  candidateId: string;
  valid: boolean;
  distanceKm: number;
  targetDistanceKm: number;
  minDistanceKm: number;
  maxDistanceKm: number;
  maxDistanceFromOriginKm: number;
  minimumMaxDistanceFromOriginKm: number;
  repeatedRoadPercent: number;
  maximumRepeatedRoadPercent: number;
  closedLoop: boolean;
  followsRoadNetwork: boolean;
  violations: AiRouteViolation[];
};

export type DescribedLoopQualityInput = {
  candidateId: string;
  origin: Coordinates;
  targetDistanceKm: number;
  geometry: LineString;
  distanceKm: number;
  segments: RouteSegment[];
  preferences?: RoutePreferences;
  returnToStart: boolean;
};

/** BR-010 — 20 % of the requested loop distance. */
export function minimumMaxDistanceFromOriginKm(
  targetDistanceKm: number,
): number {
  return targetDistanceKm * AI_LOOP_MIN_SPREAD_RATIO;
}

export function aiWaypointToCoordinates(point: AiWaypoint): Coordinates {
  return { latitude: point.latitude, longitude: point.longitude };
}

export function evaluateDescribedRoute(
  input: DescribedLoopQualityInput,
): RouteCandidateEvaluation {
  const { minDistanceKm, maxDistanceKm } = distanceBoundsKm(
    input.targetDistanceKm,
  );
  const requiredSpreadKm = minimumMaxDistanceFromOriginKm(
    input.targetDistanceKm,
  );
  const spreadKm = maxDistanceFromOriginKm(input.origin, input.geometry);
  const closedLoop = input.returnToStart
    ? isClosedLoop(input.origin, loopCandidateFrom(input))
    : true;
  const onNetwork = followsDescribedRoadNetwork(
    input.geometry,
    input.returnToStart,
  );
  const repeatedRoadPercent = measureRepeatedRoadPercentBeyondOrigin(
    input.geometry,
    input.origin,
    AI_LOOP_ORIGIN_CONNECTOR_KM,
  );
  const violations: AiRouteViolation[] = [];

  if (!onNetwork) {
    violations.push("unroutable_waypoint");
  }
  if (input.returnToStart && !closedLoop) {
    violations.push("not_closed");
  }
  if (input.distanceKm < minDistanceKm) {
    violations.push("distance_too_short");
  } else if (input.distanceKm > maxDistanceKm) {
    violations.push("distance_too_long");
  }
  if (input.returnToStart && spreadKm < requiredSpreadKm) {
    violations.push("insufficient_spread");
  }
  if (
    input.returnToStart &&
    repeatedRoadPercent > AI_LOOP_MAX_REPEATED_ROAD_PERCENT
  ) {
    violations.push("repeated_road");
  }
  if (
    input.preferences?.avoidUnpaved === true &&
    usesKnownUnpaved(input.segments)
  ) {
    violations.push("unpaved_rejected");
  }
  // FR-007 is a warning on the selected ride, not a validity-breaking
  // violation. Quebec numbered roads are often classified as trunk.
  if (
    input.preferences?.stayInCanada === true &&
    routeEntersUnitedStates({
      geometry: input.geometry,
      segments: input.segments,
    })
  ) {
    violations.push("canada_only_rejected");
  }

  return {
    candidateId: input.candidateId,
    valid: violations.length === 0,
    distanceKm: input.distanceKm,
    targetDistanceKm: input.targetDistanceKm,
    minDistanceKm,
    maxDistanceKm,
    maxDistanceFromOriginKm: spreadKm,
    minimumMaxDistanceFromOriginKm: requiredSpreadKm,
    repeatedRoadPercent,
    maximumRepeatedRoadPercent: AI_LOOP_MAX_REPEATED_ROAD_PERCENT,
    closedLoop,
    followsRoadNetwork: onNetwork,
    violations,
  };
}

export function isGeometricDescribedLoop(candidate: LoopCandidate): boolean {
  return isGeometricCircle(candidate);
}

export function namedAnchorsFromSearchNotes(
  notes: readonly NamedSearchNote[],
): string[] {
  const names = new Set<string>();
  for (const note of notes) {
    for (const part of [note.title, note.snippet]) {
      for (const token of namedTokens(part)) {
        names.add(token);
      }
    }
  }
  return [...names];
}

/**
 * FR-034 — a proposal must cite at least two named roads, villages or
 * points of interest that appear in the web notes.
 */
export function countGroundedWebAnchors(
  candidate: Pick<
    AiRouteCandidate,
    "viaPoints" | "roads" | "pointsOfInterest"
  >,
  notes: readonly NamedSearchNote[],
): number {
  if (notes.length === 0) {
    return 0;
  }
  const haystack = notes
    .map((note) => `${note.title} ${note.snippet}`.toLowerCase())
    .join("\n");
  const ids = new Set(notes.map((note) => note.id));
  const seen = new Set<string>();

  const labels = [
    ...candidate.roads,
    ...candidate.pointsOfInterest,
    ...candidate.viaPoints.map((point) => point.label),
  ];
  for (const label of labels) {
    const normalized = label.trim().toLowerCase();
    if (normalized.length < 3 || seen.has(normalized)) {
      continue;
    }
    if (haystack.includes(normalized)) {
      seen.add(normalized);
    }
  }

  for (const point of candidate.viaPoints) {
    if (point.sourceResultIds.some((id) => ids.has(id))) {
      const key = `id:${point.sourceResultIds.sort().join(",")}`;
      seen.add(key);
    }
  }

  return seen.size;
}

export function hasRequiredWebGrounding(
  candidate: Pick<
    AiRouteCandidate,
    "viaPoints" | "roads" | "pointsOfInterest"
  >,
  notes: readonly NamedSearchNote[],
): boolean {
  if (notes.length === 0) {
    return true;
  }
  return countGroundedWebAnchors(candidate, notes) >= 2;
}

export type DescribedCorrection = {
  reason: AiRouteViolation | "unusable_via_points" | "geometric_loop_rejected";
  targetDistanceKm?: number;
  actualDistanceKm?: number;
  minimumDistanceKm?: number;
  maximumDistanceKm?: number;
  distanceRatio?: number;
  minimumOuterRadiusKm?: number;
  actualMaxDistanceFromOriginKm?: number;
  requiredMaxDistanceFromOriginKm?: number;
  repeatedRoadPercent?: number;
  maximumAllowedPercent?: number;
  instruction: string;
};

export function describedCorrectionFromEvaluation(
  evaluation: RouteCandidateEvaluation,
): DescribedCorrection {
  const primary = evaluation.violations[0] ?? "unusable_via_points";
  if (primary === "distance_too_short" || primary === "distance_too_long") {
    const ratio =
      evaluation.targetDistanceKm > 0
        ? evaluation.distanceKm / evaluation.targetDistanceKm
        : 0;
    return {
      reason: primary,
      targetDistanceKm: evaluation.targetDistanceKm,
      actualDistanceKm: evaluation.distanceKm,
      minimumDistanceKm: evaluation.minDistanceKm,
      maximumDistanceKm: evaluation.maxDistanceKm,
      distanceRatio: Number(ratio.toFixed(3)),
      minimumOuterRadiusKm: evaluation.minimumMaxDistanceFromOriginKm,
      instruction:
        primary === "distance_too_short"
          ? "Expand the corridor substantially and add distant named anchors from the web results."
          : "Shorten the corridor so the road-network distance stays within ±10 % of the target.",
    };
  }
  if (primary === "insufficient_spread") {
    return {
      reason: primary,
      actualMaxDistanceFromOriginKm: evaluation.maxDistanceFromOriginKm,
      requiredMaxDistanceFromOriginKm:
        evaluation.minimumMaxDistanceFromOriginKm,
      instruction:
        "Replace nearby points with named roads or places farther from the origin.",
    };
  }
  if (primary === "repeated_road") {
    return {
      reason: primary,
      repeatedRoadPercent: Number(evaluation.repeatedRoadPercent.toFixed(1)),
      maximumAllowedPercent: evaluation.maximumRepeatedRoadPercent,
      instruction:
        "Replace the repeated return corridor with unused roads.",
    };
  }
  return {
    reason: primary,
    actualDistanceKm: evaluation.distanceKm,
    instruction: instructionForViolation(primary),
  };
}

function instructionForViolation(reason: string): string {
  if (reason === "not_closed") {
    return "Return to the origin on public roads without retracing the outbound corridor.";
  }
  if (reason === "unroutable_waypoint") {
    return "Replace unroutable coordinates with named public-road anchors from the web results.";
  }
  if (reason === "unpaved_rejected") {
    return "Use paved public roads only.";
  }
  if (reason === "highway_rejected") {
    return "Avoid motorways and trunk highways.";
  }
  if (reason === "canada_only_rejected") {
    return "Keep the entire corridor in Canada.";
  }
  return "Propose a different named corridor that satisfies every constraint.";
}

function followsDescribedRoadNetwork(
  geometry: LineString,
  returnToStart: boolean,
): boolean {
  const minimum = returnToStart
    ? MIN_ROAD_NETWORK_POINTS
    : MIN_DESTINATION_ROAD_POINTS;
  return geometry.coordinates.length >= minimum;
}

function loopCandidateFrom(input: DescribedLoopQualityInput): LoopCandidate {
  return {
    geometry: input.geometry,
    segments: input.segments,
    distanceKm: input.distanceKm,
    durationMinutes: 0,
    waypoints: [],
  };
}

function namedTokens(value: string): string[] {
  return value
    .split(/[\n,;|/]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
}
