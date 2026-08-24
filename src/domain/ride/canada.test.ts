import { describe, expect, it } from "vitest";
import type { LineString } from "@/domain/geo/types";
import {
  excludeUnitedStatesCrossing,
  routeEntersUnitedStates,
  waypointSetEntersUnitedStates,
} from "./canada";
import type { RouteSegment } from "./types";

const GRANBY = { latitude: 45.403, longitude: -72.734 };
const DETROIT = { latitude: 42.3314, longitude: -83.0458 };

function canadianGeometry(): LineString {
  return {
    type: "LineString",
    coordinates: [
      [GRANBY.longitude, GRANBY.latitude],
      [GRANBY.longitude + 0.1, GRANBY.latitude + 0.1],
    ],
  };
}

function crossingGeometry(): LineString {
  return {
    type: "LineString",
    coordinates: [
      [GRANBY.longitude, GRANBY.latitude],
      [DETROIT.longitude, DETROIT.latitude],
    ],
  };
}

function segment(geometry: RouteSegment["geometry"]): RouteSegment {
  return {
    id: "seg",
    geometry,
    distanceKm: 10,
    durationMinutes: 8,
  };
}

describe("excludeUnitedStatesCrossing (FR-028, BR-009)", () => {
  const canada = { id: "ca", crosses: false };
  const usa = { id: "us", crosses: true };

  it("drops United States candidates when stayInCanada is on", () => {
    expect(
      excludeUnitedStatesCrossing(
        [usa, canada],
        (candidate) => candidate.crosses,
        true,
      ),
    ).toEqual([canada]);
  });

  it("returns an empty list rather than silently keeping a crossing (BR-009)", () => {
    expect(
      excludeUnitedStatesCrossing([usa], (candidate) => candidate.crosses, true),
    ).toEqual([]);
  });

  it("does not filter when the preference is off", () => {
    expect(
      excludeUnitedStatesCrossing(
        [usa, canada],
        (candidate) => candidate.crosses,
        false,
      ),
    ).toEqual([usa, canada]);
  });
});

describe("routeEntersUnitedStates (FR-028)", () => {
  it("detects a crossing on the main geometry", () => {
    expect(
      routeEntersUnitedStates({
        geometry: crossingGeometry(),
        segments: [segment(canadianGeometry())],
      }),
    ).toBe(true);
  });

  it("detects a crossing on a segment even if the overview stays in Canada", () => {
    expect(
      routeEntersUnitedStates({
        geometry: canadianGeometry(),
        segments: [segment(crossingGeometry())],
      }),
    ).toBe(true);
  });

  it("accepts a route that stays in Canada", () => {
    expect(
      routeEntersUnitedStates({
        geometry: canadianGeometry(),
        segments: [segment(canadianGeometry())],
      }),
    ).toBe(false);
  });
});

describe("waypointSetEntersUnitedStates (FR-028)", () => {
  it("rejects a seed whose start is in the United States", () => {
    expect(waypointSetEntersUnitedStates(DETROIT, [GRANBY])).toBe(true);
  });

  it("rejects a seed with a waypoint in the United States", () => {
    expect(waypointSetEntersUnitedStates(GRANBY, [DETROIT])).toBe(true);
  });

  it("accepts Canadian seeds", () => {
    expect(waypointSetEntersUnitedStates(GRANBY, [GRANBY])).toBe(false);
  });
});
