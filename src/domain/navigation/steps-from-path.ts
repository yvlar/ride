import {
  haversineKm,
  initialBearingDeg,
  positionToCoordinates,
} from "@/domain/geo/distance";
import type { LineString } from "@/domain/geo/types";
import type { RouteSegment } from "@/domain/ride/types";
import { normalizeNavigationStep } from "./normalize";
import type { NavigationManeuverModifier, NavigationStep } from "./types";

/**
 * Deterministic maneuvers from a polyline, used by mock / RAG adapters
 * so tests never depend on a live routing service (FR-024).
 */
export function stepsFromPath(
  geometry: LineString,
  segments: RouteSegment[],
): NavigationStep[] {
  if (geometry.coordinates.length < 2) {
    return [];
  }

  const drafts = [];
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

  for (let index = 1; index < geometry.coordinates.length - 1; index += 1) {
    const previous = positionToCoordinates(geometry.coordinates[index - 1]!);
    const current = positionToCoordinates(geometry.coordinates[index]!);
    const next = positionToCoordinates(geometry.coordinates[index + 1]!);
    const inbound = initialBearingDeg(previous, current);
    const outbound = initialBearingDeg(current, next);
    const modifier = modifierFromHeadingChange(inbound, outbound);
    const type = modifier === "straight" ? "continue" : "turn";
    const distanceKm = haversineKm(current, next);
    const segment = segments[index] ?? segments[segments.length - 1];
    drafts.push(
      normalizeNavigationStep(
        {
          type,
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
        index,
      ),
    );
  }

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
