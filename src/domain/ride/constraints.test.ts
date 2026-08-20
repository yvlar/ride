import { describe, expect, it } from "vitest";
import { distanceBoundsKm, isWithinDistanceTolerance } from "./constraints";

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
