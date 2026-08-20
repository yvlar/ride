import { describe, expect, it } from "vitest";
import { offsetCoordinates } from "@/domain/geo/distance";
import type { Coordinates, LineString } from "@/domain/geo/types";
import { measureOverlapPercent, measureRepeatedRoadPercent } from "./overlap";

const GRANBY: Coordinates = { latitude: 45.403, longitude: -72.734 };

function line(points: Coordinates[]): LineString {
  return {
    type: "LineString",
    coordinates: points.map((point) => [point.longitude, point.latitude]),
  };
}

describe("measureRepeatedRoadPercent (BR-002)", () => {
  it("is near 0 for a simple one-way path", () => {
    const path = line([
      GRANBY,
      offsetCoordinates(GRANBY, 90, 5),
      offsetCoordinates(GRANBY, 90, 10),
    ]);

    expect(measureRepeatedRoadPercent(path)).toBeLessThan(5);
  });

  it("treats an out-and-back on the same road as heavily repeated", () => {
    const east = offsetCoordinates(GRANBY, 90, 8);
    const path = line([GRANBY, east, GRANBY]);

    expect(measureRepeatedRoadPercent(path)).toBeGreaterThan(80);
  });

  it("returns 0 for an empty geometry", () => {
    expect(
      measureRepeatedRoadPercent({ type: "LineString", coordinates: [] }),
    ).toBe(0);
  });
});

describe("measureOverlapPercent (BR-002)", () => {
  it("matches the same roadway in the reverse direction", () => {
    const east = offsetCoordinates(GRANBY, 90, 10);
    const northEast = offsetCoordinates(east, 0, 10);
    const forward = line([GRANBY, east, northEast]);
    const reverse = line([northEast, east, GRANBY]);

    expect(measureOverlapPercent(forward, reverse)).toBeGreaterThan(90);
  });

  it("is low for distinct parallel corridors", () => {
    const east = offsetCoordinates(GRANBY, 90, 10);
    const north = offsetCoordinates(GRANBY, 0, 2);
    const northEast = offsetCoordinates(north, 90, 10);
    const first = line([GRANBY, east]);
    const second = line([north, northEast]);

    expect(measureOverlapPercent(first, second)).toBeLessThan(10);
  });
});
