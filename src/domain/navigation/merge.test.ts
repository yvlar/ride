import { describe, expect, it } from "vitest";
import { offsetCoordinates } from "@/domain/geo/distance";
import { joinLineStrings } from "@/domain/geo/geometry";
import type { GeneratedDestinationRoute, GeneratedLoopRoute } from "@/domain/ride/types";
import {
  concatNavigationSteps,
  mergeRecalculatedRoute,
  remainingGeometryFromProgress,
  remainingStepsFromProgress,
  selectRejoinDistanceKm,
} from "./merge";
import type { NavigationStep } from "./types";

const start = { latitude: 45.4, longitude: -72.7 };
const east = offsetCoordinates(start, 90, 4);
const north = offsetCoordinates(east, 0, 4);

const loopGeometry: import("@/domain/geo/types").LineString = {
  type: "LineString",
  coordinates: [
    [start.longitude, start.latitude],
    [east.longitude, east.latitude],
    [north.longitude, north.latitude],
    [start.longitude, start.latitude],
  ],
};

function step(
  type: NavigationStep["maneuverType"],
  distanceKm: number,
): NavigationStep {
  return {
    id: `raw:${type}`,
    maneuverType: type,
    modifier: "straight",
    location: start,
    distanceKm,
    durationMinutes: 1,
    geometry: loopGeometry,
  };
}

const loopRoute: GeneratedLoopRoute = {
  id: "loop-1",
  type: "loop",
  start: { label: "Granby", coordinates: start },
  targetDistanceKm: 12,
  style: "scenic",
  geometry: loopGeometry,
  segments: [],
  steps: [step("depart", 0), step("turn", 4), step("arrive", 8)],
  distanceKm: 12,
  durationMinutes: 20,
  statistics: { repeatedRoadPercent: 2 },
  warnings: [],
};

describe("selectRejoinDistanceKm (FR-026)", () => {
  it("picks a point further along the remaining loop instead of the start", () => {
    const ahead = selectRejoinDistanceKm(10);
    expect(ahead).toBeGreaterThanOrEqual(0.8);
    expect(ahead).toBeLessThan(10);
  });
});

describe("remaining corridor helpers (FR-026)", () => {
  it("keeps the unused portion of a loop after the current progress", () => {
    const remaining = remainingGeometryFromProgress(loopGeometry, 4);
    expect(remaining.coordinates.length).toBeGreaterThan(1);
    const first = remaining.coordinates[0]!;
    expect(first[0]).toBeCloseTo(east.longitude, 4);
    expect(first[1]).toBeCloseTo(east.latitude, 4);
  });

  it("drops maneuvers already passed", () => {
    const remaining = remainingStepsFromProgress(loopRoute.steps ?? [], 4.1);
    expect(remaining.map((item) => item.maneuverType)).toEqual(["arrive"]);
  });
});

describe("mergeRecalculatedRoute (FR-026)", () => {
  it("splices a connector onto the remaining loop without duplicating the join", () => {
    const off = offsetCoordinates(start, 180, 0.5);
    const connector: import("@/domain/geo/types").LineString = {
      type: "LineString",
      coordinates: [
        [off.longitude, off.latitude],
        [east.longitude, east.latitude],
      ],
    };
    const remaining = remainingGeometryFromProgress(loopGeometry, 4);
    const merged = mergeRecalculatedRoute({
      original: loopRoute,
      connectorGeometry: connector,
      connectorSegments: [],
      connectorSteps: [step("depart", 0), step("turn", 0.6)],
      connectorDistanceKm: 0.6,
      connectorDurationMinutes: 1,
      remainingGeometry: remaining,
      remainingSegments: [],
      remainingSteps: [step("arrive", 8)],
      remainingDistanceKm: 8,
      remainingDurationMinutes: 12,
      avoidHighways: true,
    });

    expect(merged.geometry.coordinates[0]).toEqual(connector.coordinates[0]);
    expect(merged.steps?.some((item) => item.maneuverType === "depart")).toBe(
      true,
    );
    const joined = joinLineStrings(connector, remaining);
    expect(merged.geometry.coordinates.length).toBe(joined.coordinates.length);
  });
});

describe("concatNavigationSteps (FR-026)", () => {
  it("drops a duplicated arrive/depart pair at the splice", () => {
    const joined = concatNavigationSteps(
      [step("depart", 0), step("turn", 1), step("arrive", 0)],
      [step("depart", 0), step("continue", 2), step("arrive", 0)],
    );
    expect(joined.map((item) => item.maneuverType)).toEqual([
      "depart",
      "turn",
      "continue",
      "arrive",
    ]);
  });
});

describe("destination replacement shape (FR-026)", () => {
  it("keeps destination metadata when used as the original route", () => {
    const destination: GeneratedDestinationRoute = {
      id: "dest-1",
      type: "destination",
      start: { label: "Granby", coordinates: start },
      destination: { label: "Waterloo", coordinates: east },
      style: "curvy",
      geometry: loopGeometry,
      segments: [],
      steps: [],
      distanceKm: 4,
      durationMinutes: 8,
      warnings: [],
    };
    expect(destination.destination.label).toBe("Waterloo");
  });
});
