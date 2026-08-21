import { describe, expect, it } from "vitest";
import {
  haversineKm,
  initialBearingDeg,
  lineStringLengthKm,
  offsetCoordinates,
} from "./distance";
import type { Coordinates } from "./types";

const GRANBY: Coordinates = { latitude: 45.403, longitude: -72.734 };

describe("haversineKm", () => {
  it("returns 0 for the same point", () => {
    expect(haversineKm(GRANBY, GRANBY)).toBe(0);
  });

  it("measures a known offset of 10 km north", () => {
    const north = offsetCoordinates(GRANBY, 0, 10);
    expect(haversineKm(GRANBY, north)).toBeCloseTo(10, 1);
  });
});

describe("offsetCoordinates", () => {
  it("moves east without changing latitude much", () => {
    const east = offsetCoordinates(GRANBY, 90, 20);
    expect(east.latitude).toBeCloseTo(GRANBY.latitude, 2);
    expect(east.longitude).toBeGreaterThan(GRANBY.longitude);
  });
});

describe("initialBearingDeg", () => {
  it("points north for a due-north offset", () => {
    const north = offsetCoordinates(GRANBY, 0, 10);
    expect(initialBearingDeg(GRANBY, north)).toBeCloseTo(0, 0);
  });
});

describe("lineStringLengthKm", () => {
  it("sums consecutive segments", () => {
    const mid = offsetCoordinates(GRANBY, 90, 5);
    const end = offsetCoordinates(mid, 90, 5);
    const length = lineStringLengthKm({
      type: "LineString",
      coordinates: [
        [GRANBY.longitude, GRANBY.latitude],
        [mid.longitude, mid.latitude],
        [end.longitude, end.latitude],
      ],
    });

    expect(length).toBeCloseTo(10, 1);
  });
});
