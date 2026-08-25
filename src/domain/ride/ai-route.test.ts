import { describe, expect, it } from "vitest";
import { offsetCoordinates } from "@/domain/geo/distance";
import type { Coordinates, LineString } from "@/domain/geo/types";
import {
  countGroundedWebAnchors,
  describedCorrectionFromEvaluation,
  evaluateDescribedRoute,
  hasRequiredWebGrounding,
  minimumMaxDistanceFromOriginKm,
} from "./ai-route";
import type { RouteSegment } from "./types";

const ORIGIN: Coordinates = { latitude: 45.403, longitude: -72.734 };

function line(points: Coordinates[]): LineString {
  return {
    type: "LineString",
    coordinates: points.map((point) => [point.longitude, point.latitude]),
  };
}

function densify(geometry: LineString, pointsPerSegment = 6): LineString {
  const coordinates: LineString["coordinates"] = [];
  for (let index = 0; index < geometry.coordinates.length - 1; index += 1) {
    const from = geometry.coordinates[index];
    const to = geometry.coordinates[index + 1];
    for (let step = 0; step < pointsPerSegment; step += 1) {
      const t = step / pointsPerSegment;
      coordinates.push([
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
      ]);
    }
  }
  coordinates.push(geometry.coordinates[geometry.coordinates.length - 1]);
  return { type: "LineString", coordinates };
}

function rectangleLoop(northKm: number, eastKm: number): LineString {
  const north = offsetCoordinates(ORIGIN, 0, northKm);
  const northEast = offsetCoordinates(north, 90, eastKm);
  const east = offsetCoordinates(ORIGIN, 90, eastKm);
  return densify(
    line([ORIGIN, north, northEast, east, ORIGIN]),
    8,
  );
}

function segmentsFor(geometry: LineString, distanceKm: number): RouteSegment[] {
  return [
    {
      id: "seg",
      geometry,
      distanceKm,
      durationMinutes: distanceKm,
      surface: "paved",
      roadClass: "secondary",
    },
  ];
}

describe("minimumMaxDistanceFromOriginKm (BR-010)", () => {
  it("requires 20 % of the target distance", () => {
    expect(minimumMaxDistanceFromOriginKm(100)).toBe(20);
    expect(minimumMaxDistanceFromOriginKm(200)).toBe(40);
    expect(minimumMaxDistanceFromOriginKm(300)).toBe(60);
  });
});

describe("evaluateDescribedRoute (FR-034, BR-001, BR-010, BR-011)", () => {
  it("rejects a 200 km loop that stays within 40 km of the origin (BR-010)", () => {
    const geometry = rectangleLoop(28, 22);
    const evaluation = evaluateDescribedRoute({
      candidateId: "tight",
      origin: ORIGIN,
      targetDistanceKm: 200,
      geometry,
      distanceKm: 200,
      segments: segmentsFor(geometry, 200),
      returnToStart: true,
    });

    expect(evaluation.maxDistanceFromOriginKm).toBeLessThan(40);
    expect(evaluation.minimumMaxDistanceFromOriginKm).toBe(40);
    expect(evaluation.violations).toContain("insufficient_spread");
    expect(evaluation.valid).toBe(false);
  });

  it("rejects a loop in distance range that retraces the same corridor (BR-011)", () => {
    const far = offsetCoordinates(ORIGIN, 90, 50);
    const geometry = densify(line([ORIGIN, far, ORIGIN]), 10);
    const evaluation = evaluateDescribedRoute({
      candidateId: "out-and-back",
      origin: ORIGIN,
      targetDistanceKm: 100,
      geometry,
      distanceKm: 100,
      segments: segmentsFor(geometry, 100),
      returnToStart: true,
    });

    expect(evaluation.violations).toContain("repeated_road");
    expect(evaluation.repeatedRoadPercent).toBeGreaterThan(2);
    expect(evaluation.valid).toBe(false);
  });

  it("allows a short shared connector within 1 km of the origin (BR-011)", () => {
    const connector = offsetCoordinates(ORIGIN, 0, 0.5);
    const north = offsetCoordinates(ORIGIN, 0, 45);
    const northEast = offsetCoordinates(north, 90, 55);
    const east = offsetCoordinates(ORIGIN, 90, 55);
    const geometry = densify(
      line([ORIGIN, connector, north, northEast, east, connector, ORIGIN]),
      8,
    );
    const evaluation = evaluateDescribedRoute({
      candidateId: "connector",
      origin: ORIGIN,
      targetDistanceKm: 200,
      geometry,
      distanceKm: 200,
      segments: segmentsFor(geometry, 200),
      returnToStart: true,
    });

    expect(evaluation.violations).not.toContain("repeated_road");
    expect(evaluation.maxDistanceFromOriginKm).toBeGreaterThanOrEqual(40);
    expect(evaluation.valid).toBe(true);
  });

  it("accepts a loop in tolerance, far enough, and without material overlap", () => {
    const geometry = rectangleLoop(45, 55);
    const evaluation = evaluateDescribedRoute({
      candidateId: "valid",
      origin: ORIGIN,
      targetDistanceKm: 200,
      geometry,
      distanceKm: 200,
      segments: segmentsFor(geometry, 200),
      returnToStart: true,
    });

    expect(evaluation.violations).toEqual([]);
    expect(evaluation.maxDistanceFromOriginKm).toBeGreaterThanOrEqual(40);
    expect(evaluation.repeatedRoadPercent).toBeLessThanOrEqual(2);
    expect(evaluation.valid).toBe(true);
  });

  it("never treats 32 km as valid for a 300 km request (BR-001)", () => {
    const geometry = rectangleLoop(6, 10);
    const evaluation = evaluateDescribedRoute({
      candidateId: "short",
      origin: ORIGIN,
      targetDistanceKm: 300,
      geometry,
      distanceKm: 32,
      segments: segmentsFor(geometry, 32),
      returnToStart: true,
    });

    expect(evaluation.valid).toBe(false);
    expect(evaluation.violations).toContain("distance_too_short");
    expect(evaluation.minDistanceKm).toBe(270);
    expect(evaluation.maxDistanceKm).toBe(330);
  });

  it("does not reject an otherwise valid loop that uses trunk when avoidHighways is on (FR-007)", () => {
    const geometry = rectangleLoop(45, 55);
    const evaluation = evaluateDescribedRoute({
      candidateId: "trunk",
      origin: ORIGIN,
      targetDistanceKm: 200,
      geometry,
      distanceKm: 200,
      segments: [
        {
          id: "seg",
          geometry,
          distanceKm: 200,
          durationMinutes: 200,
          surface: "paved",
          roadClass: "trunk",
        },
      ],
      preferences: { avoidHighways: true, avoidUnpaved: true },
      returnToStart: true,
    });

    expect(evaluation.valid).toBe(true);
    expect(evaluation.violations).not.toContain("highway_rejected");
    expect(evaluation.violations).toEqual([]);
  });

  it("builds distance_too_short JSON feedback for the planner", () => {
    const geometry = rectangleLoop(6, 10);
    const evaluation = evaluateDescribedRoute({
      candidateId: "short",
      origin: ORIGIN,
      targetDistanceKm: 300,
      geometry,
      distanceKm: 32,
      segments: segmentsFor(geometry, 32),
      returnToStart: true,
    });
    const correction = describedCorrectionFromEvaluation(evaluation);

    expect(correction.reason).toBe("distance_too_short");
    expect(correction.actualDistanceKm).toBe(32);
    expect(correction.targetDistanceKm).toBe(300);
    expect(correction.minimumDistanceKm).toBe(270);
    expect(correction.distanceRatio).toBeCloseTo(0.107, 3);
    expect(correction.instruction).toMatch(/Expand the corridor/);
  });

  it("builds repeated_road JSON feedback with the measured percent", () => {
    const far = offsetCoordinates(ORIGIN, 90, 50);
    const geometry = densify(line([ORIGIN, far, ORIGIN]), 10);
    const evaluation = evaluateDescribedRoute({
      candidateId: "repeat",
      origin: ORIGIN,
      targetDistanceKm: 100,
      geometry,
      distanceKm: 100,
      segments: segmentsFor(geometry, 100),
      returnToStart: true,
    });
    const correction = describedCorrectionFromEvaluation(evaluation);

    expect(correction.reason).toBe("repeated_road");
    expect(correction.repeatedRoadPercent).toBeGreaterThan(2);
    expect(correction.maximumAllowedPercent).toBe(2);
    expect(correction.instruction).toMatch(/unused roads/i);
  });
});

describe("web grounding (FR-034)", () => {
  const notes = [
    { id: "web-1", title: "Chemin des crêtes", snippet: "Twisty paved road." },
    { id: "web-2", title: "Belvédère de Bolton", snippet: "Village lookout." },
  ];

  it("requires two named anchors from the web notes", () => {
    expect(
      hasRequiredWebGrounding(
        {
          viaPoints: [
            {
              label: "Chemin des crêtes",
              latitude: 45.5,
              longitude: -72.7,
              sourceResultIds: ["web-1"],
            },
            {
              label: "Belvédère de Bolton",
              latitude: 45.4,
              longitude: -72.5,
              sourceResultIds: ["web-2"],
            },
          ],
          roads: ["Chemin des crêtes"],
          pointsOfInterest: ["Belvédère de Bolton"],
        },
        notes,
      ),
    ).toBe(true);
    expect(
      countGroundedWebAnchors(
        {
          viaPoints: [
            {
              label: "Random field",
              latitude: 45.5,
              longitude: -72.7,
              sourceResultIds: [],
            },
          ],
          roads: [],
          pointsOfInterest: [],
        },
        notes,
      ),
    ).toBe(0);
  });
});
