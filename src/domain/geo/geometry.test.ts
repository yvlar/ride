import { describe, expect, it } from "vitest";
import { offsetCoordinates } from "./distance";
import {
  createCircleLineString,
  headingChangePerKm,
  radiusCoefficientOfVariation,
} from "./geometry";
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

describe("headingChangePerKm", () => {
  it("is 0 for a straight segment", () => {
    const east = offsetCoordinates(GRANBY, 90, 10);
    const farther = offsetCoordinates(east, 90, 10);
    const line: LineString = {
      type: "LineString",
      coordinates: [
        [GRANBY.longitude, GRANBY.latitude],
        [east.longitude, east.latitude],
        [farther.longitude, farther.latitude],
      ],
    };

    expect(headingChangePerKm(line)).toBeLessThan(0.1);
  });

  it("is higher when the path turns", () => {
    const east = offsetCoordinates(GRANBY, 90, 10);
    const northEast = offsetCoordinates(east, 0, 10);
    const bent: LineString = {
      type: "LineString",
      coordinates: [
        [GRANBY.longitude, GRANBY.latitude],
        [east.longitude, east.latitude],
        [northEast.longitude, northEast.latitude],
      ],
    };

    expect(headingChangePerKm(bent)).toBeGreaterThan(4);
  });
});
