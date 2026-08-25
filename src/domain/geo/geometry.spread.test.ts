import { describe, expect, it } from "vitest";
import { maxDistanceFromOriginKm } from "./geometry";
import { offsetCoordinates } from "./distance";
import type { Coordinates, LineString } from "./types";

const ORIGIN: Coordinates = { latitude: 45.403, longitude: -72.734 };

function line(points: Coordinates[]): LineString {
  return {
    type: "LineString",
    coordinates: points.map((point) => [point.longitude, point.latitude]),
  };
}

describe("maxDistanceFromOriginKm (BR-010)", () => {
  it("uses GeoJSON [longitude, latitude] vertices of the routed geometry", () => {
    const far = offsetCoordinates(ORIGIN, 90, 40);
    const geometry = line([
      ORIGIN,
      offsetCoordinates(ORIGIN, 0, 10),
      far,
      ORIGIN,
    ]);

    expect(maxDistanceFromOriginKm(ORIGIN, geometry)).toBeGreaterThan(39);
    expect(maxDistanceFromOriginKm(ORIGIN, geometry)).toBeLessThan(41);
    expect(geometry.coordinates[2]?.[0]).toBeCloseTo(far.longitude, 6);
    expect(geometry.coordinates[2]?.[1]).toBeCloseTo(far.latitude, 6);
  });

  it("returns 0 for an empty geometry", () => {
    expect(
      maxDistanceFromOriginKm(ORIGIN, { type: "LineString", coordinates: [] }),
    ).toBe(0);
  });
});
