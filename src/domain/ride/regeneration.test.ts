import { describe, expect, it } from "vitest";
import { offsetCoordinates } from "@/domain/geo/distance";
import type { Coordinates, LineString } from "@/domain/geo/types";
import { REGENERATION_MAX_OVERLAP_PERCENT } from "./constants";
import {
  excludeSimilarToPrevious,
  isVisiblyDifferentCorridor,
  lostOnlyToPreviousCorridor,
} from "./regeneration";

const GRANBY: Coordinates = { latitude: 45.403, longitude: -72.734 };

function line(points: Coordinates[]): LineString {
  return {
    type: "LineString",
    coordinates: points.map((point) => [point.longitude, point.latitude]),
  };
}

describe("isVisiblyDifferentCorridor (FR-012, BR-006)", () => {
  it("rejects the same roadway in either direction", () => {
    const east = offsetCoordinates(GRANBY, 90, 10);
    const northEast = offsetCoordinates(east, 0, 10);
    const forward = line([GRANBY, east, northEast]);
    const reverse = line([northEast, east, GRANBY]);

    expect(isVisiblyDifferentCorridor(forward, forward)).toBe(false);
    expect(isVisiblyDifferentCorridor(forward, reverse)).toBe(false);
  });

  it("keeps a distinct parallel corridor", () => {
    const east = offsetCoordinates(GRANBY, 90, 10);
    const north = offsetCoordinates(GRANBY, 0, 2);
    const northEast = offsetCoordinates(north, 90, 10);
    const first = line([GRANBY, east]);
    const second = line([north, northEast]);

    expect(isVisiblyDifferentCorridor(first, second)).toBe(true);
  });
});

describe("excludeSimilarToPrevious (FR-012, BR-006)", () => {
  it("drops candidates that reuse the previous corridor", () => {
    const east = offsetCoordinates(GRANBY, 90, 12);
    const north = offsetCoordinates(GRANBY, 0, 12);
    const previous = line([GRANBY, east]);
    const same = { id: "same", geometry: previous };
    const reverse = {
      id: "reverse",
      geometry: line([east, GRANBY]),
    };
    const distinct = { id: "north", geometry: line([GRANBY, north]) };

    const kept = excludeSimilarToPrevious(
      [same, reverse, distinct],
      previous,
      (candidate) => candidate.geometry,
    );

    expect(kept.map((candidate) => candidate.id)).toEqual(["north"]);
  });

  it("uses the 30 % implementation threshold from CURSOR.md", () => {
    expect(REGENERATION_MAX_OVERLAP_PERCENT).toBe(30);
  });

  it("does not treat a zero-length previous corridor as distinct (BR-006)", () => {
    const empty = line([GRANBY, GRANBY]);
    const east = line([GRANBY, offsetCoordinates(GRANBY, 90, 8)]);

    expect(isVisiblyDifferentCorridor(empty, east)).toBe(false);
    expect(isVisiblyDifferentCorridor(east, empty)).toBe(false);
  });
});

describe("lostOnlyToPreviousCorridor (FR-012, BR-006)", () => {
  it("is true when a valid route existed but only similar corridors remained", () => {
    const previous = line([GRANBY, offsetCoordinates(GRANBY, 90, 8)]);
    expect(
      lostOnlyToPreviousCorridor(previous, "no_route_found", "selected"),
    ).toBe(true);
    expect(
      lostOnlyToPreviousCorridor(previous, "distance_out_of_tolerance", "selected"),
    ).toBe(true);
  });

  it("is false when generation would fail even without the previous corridor", () => {
    const previous = line([GRANBY, offsetCoordinates(GRANBY, 90, 8)]);
    expect(
      lostOnlyToPreviousCorridor(previous, "no_route_found", "no_route_found"),
    ).toBe(false);
    expect(lostOnlyToPreviousCorridor(undefined, "no_route_found", "selected")).toBe(
      false,
    );
  });
});
