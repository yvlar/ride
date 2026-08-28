import {
  coordinatesToPosition,
  haversineKm,
  initialBearingDeg,
  offsetCoordinates,
  positionToCoordinates,
} from "@/domain/geo/distance";
import type { LineString } from "@/domain/geo/types";

export type RouteSplit = {
  /** Portion already ridden, from the origin up to `progressKm`. */
  traveled: LineString;
  /** Portion still ahead, from `progressKm` to the destination. */
  remaining: LineString;
};

function emptyLine(): LineString {
  return { type: "LineString", coordinates: [] };
}


/**
 * Split a route at a distance along the line so the map can draw the ridden
 * portion apart from the portion still ahead (FR-041).
 *
 * The cut point is inserted in both halves, so the two lines stay visually
 * joined and never leave a gap under the rider puck.
 */
export function splitLineStringAtKm(
  geometry: LineString,
  progressKm: number,
): RouteSplit {
  const positions = geometry.coordinates;
  if (positions.length < 2) {
    return { traveled: emptyLine(), remaining: { type: "LineString", coordinates: [...positions] } };
  }
  if (!Number.isFinite(progressKm) || progressKm <= 0) {
    return {
      traveled: emptyLine(),
      remaining: { type: "LineString", coordinates: [...positions] },
    };
  }

  const traveled: LineString["coordinates"] = [positions[0]!];
  let accumulatedKm = 0;

  for (let index = 1; index < positions.length; index += 1) {
    const from = positionToCoordinates(positions[index - 1]!);
    const to = positionToCoordinates(positions[index]!);
    const segmentKm = haversineKm(from, to);
    const nextKm = accumulatedKm + segmentKm;

    if (nextKm < progressKm) {
      traveled.push(positions[index]!);
      accumulatedKm = nextKm;
      continue;
    }

    // Walk the remainder along the segment bearing rather than interpolating
    // lat/lng linearly: the two only agree over short segments, and the
    // dimmed line would otherwise creep ahead of the rider on a long straight.
    const alongKm = Math.min(segmentKm, Math.max(0, progressKm - accumulatedKm));
    const cut = coordinatesToPosition(
      offsetCoordinates(from, initialBearingDeg(from, to), alongKm),
    );
    traveled.push(cut);
    return {
      traveled: { type: "LineString", coordinates: traveled },
      remaining: {
        type: "LineString",
        coordinates: [cut, ...positions.slice(index)],
      },
    };
  }

  // The rider is past the last vertex: everything is behind them.
  const last = positions[positions.length - 1]!;
  return {
    traveled: { type: "LineString", coordinates: [...positions] },
    remaining: { type: "LineString", coordinates: [last] },
  };
}
