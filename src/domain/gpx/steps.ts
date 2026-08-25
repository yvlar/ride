import {
  haversineKm,
  initialBearingDeg,
  coordinatesToPosition,
  positionToCoordinates,
} from "@/domain/geo/distance";
import type { LineString } from "@/domain/geo/types";
import { normalizeNavigationStep } from "@/domain/navigation/normalize";
import type {
  NavigationManeuverModifier,
  NavigationStep,
} from "@/domain/navigation/types";
import type { RouteSegment } from "@/domain/ride/types";

const MIN_TURN_DEG = 32;
const MIN_STEP_KM = 0.05;

/**
 * FR-039 — GPX traces are dense. Announce only meaningful heading changes
 * so the existing overlay can reuse FR-024 without a turn at every vertex.
 */
export function stepsFromGpxPath(
  geometry: LineString,
  segments: RouteSegment[],
): NavigationStep[] {
  if (geometry.coordinates.length < 2) {
    return [];
  }

  const drafts: NavigationStep[] = [];
  const first = positionToCoordinates(geometry.coordinates[0]!);
  const second = positionToCoordinates(geometry.coordinates[1]!);
  drafts.push(
    normalizeNavigationStep(
      {
        type: "depart",
        modifier: "straight",
        location: first,
        bearingAfterDeg: initialBearingDeg(first, second),
        name: segments[0]?.roadName,
        distanceKm: 0,
        durationMinutes: 0,
        geometry: {
          type: "LineString",
          coordinates: geometry.coordinates.slice(0, 2),
        },
      },
      0,
    ),
  );

  let lastAnnounced = 0;
  let lastBearing = initialBearingDeg(first, second);
  let accumulatedKm = 0;

  for (let index = 1; index < geometry.coordinates.length - 1; index += 1) {
    const previous = positionToCoordinates(geometry.coordinates[index - 1]!);
    const current = positionToCoordinates(geometry.coordinates[index]!);
    const next = positionToCoordinates(geometry.coordinates[index + 1]!);
    const inbound = initialBearingDeg(previous, current);
    const outbound = initialBearingDeg(current, next);
    const distanceKm = haversineKm(current, next);
    accumulatedKm += haversineKm(previous, current);
    const delta = headingDeltaDeg(inbound, outbound);
    const farEnough = accumulatedKm - lastAnnounced >= MIN_STEP_KM;
    if (delta < MIN_TURN_DEG || !farEnough) {
      continue;
    }
    const modifier = modifierFromHeadingChange(inbound, outbound);
    const segment = segments[index] ?? segments[segments.length - 1];
    drafts.push(
      normalizeNavigationStep(
        {
          type: modifier === "straight" ? "continue" : "turn",
          modifier,
          location: current,
          bearingBeforeDeg: inbound,
          bearingAfterDeg: outbound,
          name: segment?.roadName,
          distanceKm,
          durationMinutes: segment?.durationMinutes ?? (distanceKm / 60) * 60,
          geometry: {
            type: "LineString",
            coordinates: [
              geometry.coordinates[index]!,
              geometry.coordinates[index + 1]!,
            ],
          },
        },
        drafts.length,
      ),
    );
    lastAnnounced = accumulatedKm;
    lastBearing = outbound;
  }

  void lastBearing;

  const last = positionToCoordinates(
    geometry.coordinates[geometry.coordinates.length - 1]!,
  );
  const beforeLast = positionToCoordinates(
    geometry.coordinates[geometry.coordinates.length - 2]!,
  );
  drafts.push(
    normalizeNavigationStep(
      {
        type: "arrive",
        modifier: "straight",
        location: last,
        bearingBeforeDeg: initialBearingDeg(beforeLast, last),
        name: segments[segments.length - 1]?.roadName,
        distanceKm: 0,
        durationMinutes: 0,
        geometry: {
          type: "LineString",
          coordinates: geometry.coordinates.slice(-2),
        },
      },
      drafts.length,
    ),
  );

  return drafts;
}

function headingDeltaDeg(fromBearing: number, toBearing: number): number {
  const raw = Math.abs(toBearing - fromBearing) % 360;
  return raw > 180 ? 360 - raw : raw;
}

function modifierFromHeadingChange(
  inbound: number,
  outbound: number,
): NavigationManeuverModifier {
  const raw = ((outbound - inbound + 540) % 360) - 180;
  if (Math.abs(raw) < 20) {
    return "straight";
  }
  if (raw > 150 || raw < -150) {
    return "uturn";
  }
  if (raw >= 20 && raw < 45) {
    return "slight_right";
  }
  if (raw >= 45 && raw < 135) {
    return "right";
  }
  if (raw >= 135) {
    return "sharp_right";
  }
  if (raw <= -20 && raw > -45) {
    return "slight_left";
  }
  if (raw <= -45 && raw > -135) {
    return "left";
  }
  return "sharp_left";
}

export function lineStringFromPositions(
  coordinates: LineString["coordinates"],
): LineString {
  return { type: "LineString", coordinates };
}

export { coordinatesToPosition };
