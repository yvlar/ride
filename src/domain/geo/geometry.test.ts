import { describe, expect, it } from "vitest";
import { offsetCoordinates } from "./distance";
import {
  createCircleLineString,
  headingChangePerKm,
  joinLineStrings,
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

describe("joinLineStrings (FR-003)", () => {
  it("does not duplicate the shared destination vertex", () => {
    const east = offsetCoordinates(GRANBY, 90, 10);
    const north = offsetCoordinates(east, 0, 10);
    const outbound: LineString = {
      type: "LineString",
      coordinates: [
        [GRANBY.longitude, GRANBY.latitude],
        [east.longitude, east.latitude],
      ],
    };
    const inbound: LineString = {
      type: "LineString",
      coordinates: [
        [east.longitude, east.latitude],
        [north.longitude, north.latitude],
      ],
    };

    const joined = joinLineStrings(outbound, inbound);

    expect(joined.coordinates).toHaveLength(3);
    expect(joined.coordinates[1]).toEqual([east.longitude, east.latitude]);
  });

  it("skips a near-duplicate join vertex from a routing connector (FR-026)", () => {
    const east = offsetCoordinates(GRANBY, 90, 10);
    const snapped = offsetCoordinates(east, 0, 0.01);
    const north = offsetCoordinates(east, 0, 10);
    const connector: LineString = {
      type: "LineString",
      coordinates: [
        [GRANBY.longitude, GRANBY.latitude],
        [snapped.longitude, snapped.latitude],
      ],
    };
    const remaining: LineString = {
      type: "LineString",
      coordinates: [
        [east.longitude, east.latitude],
        [north.longitude, north.latitude],
      ],
    };

    const joined = joinLineStrings(connector, remaining);
    expect(joined.coordinates).toHaveLength(3);
    expect(joined.coordinates[1]).toEqual([
      snapped.longitude,
      snapped.latitude,
    ]);
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
