import { describe, expect, it } from "vitest";
import { lineStringLengthKm } from "@/domain/geo/distance";
import type { LineString } from "@/domain/geo/types";
import { splitLineStringAtKm } from "./route-split";

/** ~1.11 km per 0.01° of latitude at this scale. */
const line: LineString = {
  type: "LineString",
  coordinates: [
    [-72.7, 45.4],
    [-72.7, 45.41],
    [-72.7, 45.42],
    [-72.7, 45.43],
  ],
};

describe("splitLineStringAtKm (FR-042)", () => {
  it("returns the whole route as remaining before the rider moves", () => {
    const split = splitLineStringAtKm(line, 0);
    expect(split.traveled.coordinates).toEqual([]);
    expect(split.remaining.coordinates).toEqual(line.coordinates);
  });

  it("ignores a negative or non-finite progress", () => {
    for (const km of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const split = splitLineStringAtKm(line, km);
      expect(split.traveled.coordinates).toEqual([]);
      expect(split.remaining.coordinates).toEqual(line.coordinates);
    }
  });

  it("cuts at the exact distance and keeps the two halves joined", () => {
    const total = lineStringLengthKm(line);
    const split = splitLineStringAtKm(line, total / 2);

    expect(lineStringLengthKm(split.traveled)).toBeCloseTo(total / 2, 3);
    expect(lineStringLengthKm(split.remaining)).toBeCloseTo(total / 2, 3);

    const lastTraveled = split.traveled.coordinates.at(-1);
    const firstRemaining = split.remaining.coordinates[0];
    expect(lastTraveled).toEqual(firstRemaining);
  });

  it("splits inside a segment rather than snapping to a vertex", () => {
    const split = splitLineStringAtKm(line, 0.5);
    const cut = split.traveled.coordinates.at(-1)!;
    expect(cut[1]).toBeGreaterThan(45.4);
    expect(cut[1]).toBeLessThan(45.41);
    expect(lineStringLengthKm(split.traveled)).toBeCloseTo(0.5, 3);
  });

  it("treats the whole route as ridden once progress passes the end", () => {
    const split = splitLineStringAtKm(line, lineStringLengthKm(line) + 10);
    expect(split.traveled.coordinates).toEqual(line.coordinates);
    expect(split.remaining.coordinates).toEqual([line.coordinates.at(-1)]);
  });

  it("never crashes on a degenerate geometry", () => {
    const single: LineString = { type: "LineString", coordinates: [[-72.7, 45.4]] };
    const split = splitLineStringAtKm(single, 1);
    expect(split.traveled.coordinates).toEqual([]);
    expect(split.remaining.coordinates).toEqual(single.coordinates);
  });
});
