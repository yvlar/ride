import { describe, expect, it } from "vitest";
import { haversineKm, offsetCoordinates } from "@/domain/geo/distance";
import type { Coordinates, LineString } from "@/domain/geo/types";
import {
  CORRIDOR_VIA_MAX_POINTS,
  CORRIDOR_VIA_MIN_SPACING_KM,
  sampleCorridorViaPoints,
  thinCorridorViaPoints,
  uniqueWaypointAttempts,
} from "./sample-corridor-via-points";

const ORIGIN: Coordinates = { latitude: 45.403, longitude: -72.734 };

function lineFrom(points: Coordinates[]): LineString {
  return {
    type: "LineString",
    coordinates: points.map((point) => [point.longitude, point.latitude]),
  };
}

function gridCorridor(cells: number): Coordinates[] {
  const points: Coordinates[] = [ORIGIN];
  for (let index = 1; index <= cells; index += 1) {
    points.push(offsetCoordinates(ORIGIN, 90, index * 2));
  }
  return points;
}

describe("sampleCorridorViaPoints (FR-029, FR-001)", () => {
  it("excludes endpoints and keeps fewer points than the grid corridor", () => {
    const points = gridCorridor(20);
    const vias = sampleCorridorViaPoints(lineFrom(points));

    expect(vias.length).toBeGreaterThan(0);
    expect(vias.length).toBeLessThan(points.length - 2);
    expect(vias.length).toBeLessThanOrEqual(CORRIDOR_VIA_MAX_POINTS);
    expect(haversineKm(vias[0] ?? ORIGIN, ORIGIN)).toBeGreaterThan(1);
    const dest = points[points.length - 1];
    expect(dest).toBeDefined();
    if (!dest) {
      return;
    }
    expect(haversineKm(vias[vias.length - 1] ?? ORIGIN, dest)).toBeGreaterThan(
      1,
    );
  });

  it("respects a minimum spacing between via-points", () => {
    const points = gridCorridor(16);
    const vias = sampleCorridorViaPoints(lineFrom(points));

    for (let index = 1; index < vias.length; index += 1) {
      const previous = vias[index - 1];
      const current = vias[index];
      if (!previous || !current) {
        continue;
      }
      expect(haversineKm(previous, current)).toBeGreaterThanOrEqual(
        CORRIDOR_VIA_MIN_SPACING_KM - 0.2,
      );
    }
  });

  it("keeps turn vertices of an L-shaped corridor", () => {
    const corner = offsetCoordinates(ORIGIN, 90, 20);
    const dest = offsetCoordinates(corner, 0, 20);
    const geometry = lineFrom([
      ORIGIN,
      offsetCoordinates(ORIGIN, 90, 10),
      corner,
      offsetCoordinates(corner, 0, 10),
      dest,
    ]);
    const vias = sampleCorridorViaPoints(geometry, {
      minSpacingKm: 8,
      targetSpacingKm: 12,
    });

    expect(
      vias.some((point) => haversineKm(point, corner) < 0.2),
    ).toBe(true);
  });

  it("returns no vias for a two-point chord", () => {
    expect(
      sampleCorridorViaPoints(
        lineFrom([ORIGIN, offsetCoordinates(ORIGIN, 90, 12)]),
      ),
    ).toEqual([]);
  });
});

describe("thinCorridorViaPoints (FR-029)", () => {
  it("downsamples while keeping order", () => {
    const vias = gridCorridor(9).slice(1, 8);
    const thinned = thinCorridorViaPoints(vias, 3);
    expect(thinned).toHaveLength(3);
    expect(thinned[0]).toEqual(vias[0]);
    expect(thinned[thinned.length - 1]).toEqual(vias[vias.length - 1]);
  });
});

describe("uniqueWaypointAttempts (FR-029)", () => {
  it("drops duplicate waypoint lists", () => {
    const a = [offsetCoordinates(ORIGIN, 90, 8)];
    const attempts = uniqueWaypointAttempts([a, a, [], []]);
    expect(attempts).toHaveLength(2);
  });
});
