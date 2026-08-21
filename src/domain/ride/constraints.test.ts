import { describe, expect, it } from "vitest";
import {
  distanceBoundsKm,
  isWithinDistanceTolerance,
  usesKnownUnpaved,
} from "./constraints";
import type { RouteSegment } from "./types";

describe("distanceBoundsKm (BR-001)", () => {
  it("uses a ±10 % window around the requested distance", () => {
    expect(distanceBoundsKm(100)).toEqual({
      minDistanceKm: 90,
      maxDistanceKm: 110,
    });
  });

  it("accepts a distance inside the window and rejects one outside", () => {
    expect(isWithinDistanceTolerance(90, 100)).toBe(true);
    expect(isWithinDistanceTolerance(110, 100)).toBe(true);
    expect(isWithinDistanceTolerance(89.9, 100)).toBe(false);
    expect(isWithinDistanceTolerance(110.1, 100)).toBe(false);
  });
});

describe("usesKnownUnpaved (BR-007)", () => {
  const paved: RouteSegment = {
    id: "paved",
    geometry: { type: "LineString", coordinates: [[0, 0], [1, 0]] },
    distanceKm: 1,
    durationMinutes: 1,
    surface: "paved",
  };
  const unpaved: RouteSegment = { ...paved, id: "unpaved", surface: "unpaved" };
  const unknown: RouteSegment = { ...paved, id: "unknown", surface: "unknown" };

  it("detects a known unpaved segment", () => {
    expect(usesKnownUnpaved([paved, unpaved])).toBe(true);
  });

  it("does not treat unknown surface as known unpaved", () => {
    expect(usesKnownUnpaved([paved, unknown])).toBe(false);
  });
});
