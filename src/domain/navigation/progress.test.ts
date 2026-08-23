import { describe, expect, it } from "vitest";
import { offsetCoordinates } from "@/domain/geo/distance";
import {
  evaluateNavigationProgress,
  projectOnRoute,
  selectNextStep,
  stabilizeProgressKm,
} from "./progress";
import type { NavigationStep } from "./types";

const origin = { latitude: 45.4, longitude: -72.7 };
const east1 = offsetCoordinates(origin, 90, 1);
const east2 = offsetCoordinates(origin, 90, 2);
const geometry: import("@/domain/geo/types").LineString = {
  type: "LineString",
  coordinates: [
    [origin.longitude, origin.latitude],
    [east1.longitude, east1.latitude],
    [east2.longitude, east2.latitude],
  ],
};

function step(
  id: string,
  type: NavigationStep["maneuverType"],
  distanceKm: number,
): NavigationStep {
  return {
    id,
    maneuverType: type,
    modifier: "straight",
    location: origin,
    distanceKm,
    durationMinutes: distanceKm,
    geometry,
  };
}

describe("projectOnRoute (FR-024)", () => {
  it("projects a GPS fix onto the route line and reports progress", () => {
    const mid = offsetCoordinates(origin, 90, 0.5);
    const projection = projectOnRoute(mid, geometry);
    expect(projection).not.toBeNull();
    expect(projection!.progressKm).toBeCloseTo(0.5, 2);
    expect(projection!.distanceToRouteM).toBeLessThan(5);
    expect(projection!.remainingDistanceKm).toBeCloseTo(1.5, 2);
  });

  it("measures the distance of an offset GPS fix to the line", () => {
    const parallel = offsetCoordinates(
      offsetCoordinates(origin, 90, 0.5),
      0,
      0.03,
    );
    const projection = projectOnRoute(parallel, geometry);
    expect(projection!.distanceToRouteM).toBeGreaterThan(25);
    expect(projection!.distanceToRouteM).toBeLessThan(40);
  });
});

describe("selectNextStep (FR-024)", () => {
  const steps = [
    step("depart", "depart", 1),
    step("turn", "turn", 1),
    step("arrive", "arrive", 0),
  ];

  it("selects the upcoming maneuver from cumulative progress", () => {
    expect(selectNextStep(steps, 0.1).nextStep?.id).toBe("turn");
    expect(selectNextStep(steps, 1.1).nextStep?.maneuverType).toBe("arrive");
  });
});

describe("stabilizeProgressKm hysteresis (FR-024)", () => {
  it("does not walk instructions backward for small GPS noise", () => {
    expect(stabilizeProgressKm(1.2, 1.185)).toBe(1.2);
    expect(stabilizeProgressKm(1.2, 1.1)).toBe(1.1);
  });

  it("still advances after a large but real gap (tunnel, hidden tab)", () => {
    expect(stabilizeProgressKm(0.2, 2.2)).toBe(2.2);
  });
});

describe("projectOnRoute closed loop (FR-001, FR-024)", () => {
  const south = offsetCoordinates(origin, 180, 16);
  const west = offsetCoordinates(south, 270, 16);
  const loop: import("@/domain/geo/types").LineString = {
    type: "LineString",
    coordinates: [
      [origin.longitude, origin.latitude],
      [east1.longitude, east1.latitude],
      [south.longitude, south.latitude],
      [west.longitude, west.latitude],
      [origin.longitude, origin.latitude],
    ],
  };

  it("keeps a first fix near the start on the outbound rather than the finish", () => {
    const inboundNearStart = offsetCoordinates(origin, 180, 0.04);
    const projection = projectOnRoute(inboundNearStart, loop);
    expect(projection!.progressKm).toBeLessThan(1);
    expect(projection!.remainingDistanceKm).toBeGreaterThan(30);
  });

  it("does not snap to the finish after the rider has left the start", () => {
    const inboundNearStart = offsetCoordinates(origin, 180, 0.04);
    const projection = projectOnRoute(inboundNearStart, loop, 1);
    expect(projection!.progressKm).toBeLessThan(5);
    expect(projection!.remainingDistanceKm).toBeGreaterThan(20);
  });
});

describe("evaluateNavigationProgress low accuracy (FR-024)", () => {
  it("warns on a coarse GPS fix and does not jump the maneuver", () => {
    const steps = [step("depart", "depart", 2), step("turn", "turn", 0)];
    const progress = evaluateNavigationProgress({
      fix: {
        coordinates: east2,
        accuracyMeters: 180,
        recordedAtMs: 1,
      },
      geometry,
      steps,
      totalDistanceKm: 2,
      totalDurationMinutes: 4,
      previousProgressKm: 0.2,
    });

    expect(progress?.lowAccuracy).toBe(true);
    expect(progress?.projection.progressKm).toBeCloseTo(0.2, 5);
    expect(progress?.nextStep?.id).toBe("turn");
    expect(progress?.distanceToNextManeuverM).toBe(Number.POSITIVE_INFINITY);
  });

  it("catches up after a multi-kilometre GPS gap on an open line", () => {
    const first = evaluateNavigationProgress({
      fix: {
        coordinates: offsetCoordinates(origin, 90, 0.2),
        accuracyMeters: 8,
        recordedAtMs: 1,
      },
      geometry,
      steps: [step("depart", 2), step("arrive", 0)],
      totalDistanceKm: 2,
      totalDurationMinutes: 4,
      previousProgressKm: null,
    });
    const second = evaluateNavigationProgress({
      fix: {
        coordinates: east2,
        accuracyMeters: 8,
        recordedAtMs: 2,
      },
      geometry,
      steps: [step("depart", 2), step("arrive", 0)],
      totalDistanceKm: 2,
      totalDurationMinutes: 4,
      previousProgressKm: first?.projection.progressKm ?? 0.2,
    });
    expect(second?.projection.progressKm).toBeCloseTo(2, 1);
  });
});
