import { describe, expect, it } from "vitest";
import { offsetCoordinates } from "@/domain/geo/distance";
import type { Coordinates, LineString } from "@/domain/geo/types";
import { measureOverlapPercent, measureRepeatedRoadPercent, measureRepeatedRoadPercentBeyondOrigin } from "./overlap";

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

describe("measureRepeatedRoadPercentBeyondOrigin (BR-011)", () => {
  it("allows a short shared connector within 1 km of the origin", () => {
    const connector = offsetCoordinates(GRANBY, 0, 0.6);
    const north = offsetCoordinates(GRANBY, 0, 30);
    const east = offsetCoordinates(GRANBY, 90, 30);
    const path = line([
      GRANBY,
      connector,
      north,
      east,
      connector,
      GRANBY,
    ]);

    expect(measureRepeatedRoadPercent(path)).toBeGreaterThan(0);
    expect(
      measureRepeatedRoadPercentBeyondOrigin(path, GRANBY, 1),
    ).toBeLessThanOrEqual(2);
  });

  it("still rejects a material out-and-back far from the origin", () => {
    const far = offsetCoordinates(GRANBY, 90, 40);
    const path = line([GRANBY, far, GRANBY]);

    expect(
      measureRepeatedRoadPercentBeyondOrigin(path, GRANBY, 1),
    ).toBeGreaterThan(50);
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
