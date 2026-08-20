import { describe, expect, it } from "vitest";
import { radiusCoefficientOfVariation, createCircleLineString } from "./geometry";
import type { Coordinates, LineString } from "./types";

const GRANBY: Coordinates = { latitude: 45.403, longitude: -72.734 };

describe("radiusCoefficientOfVariation", () => {
  it("is near 0 for a geometric circle", () => {
    const circle = createCircleLineString(GRANBY, 20, 36);
    expect(radiusCoefficientOfVariation(circle)).toBeLessThan(0.02);
  });

  it("is higher for a rectangular path", () => {
    const rectangle: LineString = {
      type: "LineString",
      coordinates: [
        [-72.734, 45.403],
        [-72.5, 45.403],
        [-72.5, 45.55],
        [-72.734, 45.55],
        [-72.734, 45.403],
      ],
    };

    expect(radiusCoefficientOfVariation(rectangle)).toBeGreaterThan(0.06);
  });
});
