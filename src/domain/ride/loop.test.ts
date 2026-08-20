import { describe, expect, it } from "vitest";
import { offsetCoordinates } from "@/domain/geo/distance";
import { createCircleLineString } from "@/domain/geo/geometry";
import type { Coordinates, LineString } from "@/domain/geo/types";
import {
  createLoopWaypointSets,
  evaluateLoopCandidate,
  selectBestLoopCandidate,
} from "./loop";
import type { LoopCandidate } from "./types";

const GRANBY: Coordinates = { latitude: 45.403, longitude: -72.734 };

function candidateFromGeometry(
  geometry: LineString,
  distanceKm: number,
): LoopCandidate {
  return {
    geometry,
    segments: [],
    distanceKm,
    durationMinutes: distanceKm,
    waypoints: [],
  };
}

function densify(geometry: LineString, pointsPerSegment = 3): LineString {
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

describe("createLoopWaypointSets (FR-001)", () => {
  it("seeds several non-circular waypoint rings around the start", () => {
    const sets = createLoopWaypointSets(GRANBY, 80);

    expect(sets.length).toBeGreaterThan(8);
    expect(sets[0]?.waypoints.length).toBeGreaterThanOrEqual(2);
    for (const point of sets[0]?.waypoints ?? []) {
      expect(point.latitude).not.toBeCloseTo(GRANBY.latitude, 4);
    }
  });
});

describe("evaluateLoopCandidate (FR-001)", () => {
  it("rejects a perfect geometric circle as an unacceptable loop", () => {
    const center = offsetCoordinates(GRANBY, 90, 12);
    const circle = createCircleLineString(center, 12, 36, 270);
    const evaluation = evaluateLoopCandidate(
      GRANBY,
      80,
      candidateFromGeometry(circle, 75),
    );

    expect(evaluation.isGeometricCircle).toBe(true);
    expect(evaluation.isClosed).toBe(true);
  });

  it("accepts a closed road-like rectangle that starts and ends at the start", () => {
    const east = offsetCoordinates(GRANBY, 90, 10);
    const northEast = offsetCoordinates(east, 0, 10);
    const north = offsetCoordinates(GRANBY, 0, 10);
    const geometry: LineString = densify({
      type: "LineString",
      coordinates: [
        [GRANBY.longitude, GRANBY.latitude],
        [east.longitude, east.latitude],
        [northEast.longitude, northEast.latitude],
        [north.longitude, north.latitude],
        [GRANBY.longitude, GRANBY.latitude],
      ],
    });

    const evaluation = evaluateLoopCandidate(
      GRANBY,
      40,
      candidateFromGeometry(geometry, 40),
    );

    expect(evaluation.isClosed).toBe(true);
    expect(evaluation.followsRoadNetwork).toBe(true);
    expect(evaluation.isGeometricCircle).toBe(false);
  });
});

describe("selectBestLoopCandidate (BR-001, BR-002)", () => {
  it("prefers a viable loop with less repeated road over one that doubles back", () => {
    const east = offsetCoordinates(GRANBY, 90, 20);
    const northEast = offsetCoordinates(east, 0, 20);
    const north = offsetCoordinates(GRANBY, 0, 20);
    const loopGeometry = densify({
      type: "LineString",
      coordinates: [
        [GRANBY.longitude, GRANBY.latitude],
        [east.longitude, east.latitude],
        [northEast.longitude, northEast.latitude],
        [north.longitude, north.latitude],
        [GRANBY.longitude, GRANBY.latitude],
      ],
    });

    const outAndBack = densify({
      type: "LineString",
      coordinates: [
        [GRANBY.longitude, GRANBY.latitude],
        [east.longitude, east.latitude],
        [GRANBY.longitude, GRANBY.latitude],
      ],
    });

    const selection = selectBestLoopCandidate(
      [
        evaluateLoopCandidate(
          GRANBY,
          80,
          candidateFromGeometry(outAndBack, 80),
        ),
        evaluateLoopCandidate(
          GRANBY,
          80,
          candidateFromGeometry(loopGeometry, 80),
        ),
      ],
      80,
    );

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.repeatedRoadPercent).toBeLessThan(40);
  });

  it("does not silently widen BR-001 when every viable loop is outside ±10 %", () => {
    const east = offsetCoordinates(GRANBY, 90, 30);
    const northEast = offsetCoordinates(east, 0, 30);
    const north = offsetCoordinates(GRANBY, 0, 30);
    const geometry = densify({
      type: "LineString",
      coordinates: [
        [GRANBY.longitude, GRANBY.latitude],
        [east.longitude, east.latitude],
        [northEast.longitude, northEast.latitude],
        [north.longitude, north.latitude],
        [GRANBY.longitude, GRANBY.latitude],
      ],
    });

    const selection = selectBestLoopCandidate(
      [
        evaluateLoopCandidate(
          GRANBY,
          50,
          candidateFromGeometry(geometry, 120),
        ),
      ],
      50,
    );

    expect(selection.status).toBe("distance_out_of_tolerance");
    if (selection.status !== "distance_out_of_tolerance") {
      return;
    }
    expect(selection.evaluation.candidate.distanceKm).toBe(120);
  });
});
