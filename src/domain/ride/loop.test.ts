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
    const circle = createCircleLineString(GRANBY, 12, 36);
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
    const extra = offsetCoordinates(GRANBY, 90, 5);
    const geometry: LineString = {
      type: "LineString",
      coordinates: [
        [GRANBY.longitude, GRANBY.latitude],
        [extra.longitude, extra.latitude],
        [east.longitude, east.latitude],
        [northEast.longitude, northEast.latitude],
        [north.longitude, north.latitude],
        [GRANBY.longitude, GRANBY.latitude],
      ],
    };
    // Pad with interpolated points so the trace looks like a road network.
    const dense: LineString = {
      type: "LineString",
      coordinates: geometry.coordinates.flatMap((point, index, all) => {
        const next = all[index + 1];
        if (!next) {
          return [point];
        }
        return [point, [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2]];
      }),
    };

    const evaluation = evaluateLoopCandidate(
      GRANBY,
      40,
      candidateFromGeometry(dense, 40),
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
    const loopGeometry: LineString = {
      type: "LineString",
      coordinates: [
        [GRANBY.longitude, GRANBY.latitude],
        [east.longitude, east.latitude],
        [northEast.longitude, northEast.latitude],
        [north.longitude, north.latitude],
        [GRANBY.longitude, GRANBY.latitude],
      ],
    };
    const paddedLoop: LineString = {
      type: "LineString",
      coordinates: Array.from({ length: 12 }, (_, index) => {
        const points = loopGeometry.coordinates;
        const segment = index % (points.length - 1);
        const t = (index % 3) / 3;
        const from = points[segment];
        const to = points[segment + 1];
        return [
          from[0] + (to[0] - from[0]) * t,
          from[1] + (to[1] - from[1]) * t,
        ];
      }).concat([loopGeometry.coordinates[0]]),
    };

    const outAndBack: LineString = {
      type: "LineString",
      coordinates: [
        [GRANBY.longitude, GRANBY.latitude],
        [east.longitude, east.latitude],
        [GRANBY.longitude, GRANBY.latitude],
        [east.longitude, east.latitude],
        [GRANBY.longitude, GRANBY.latitude],
        [east.longitude, east.latitude],
        [GRANBY.longitude, GRANBY.latitude],
        [east.longitude, east.latitude],
        [GRANBY.longitude, GRANBY.latitude],
      ],
    };

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
          candidateFromGeometry(paddedLoop, 80),
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
    const geometry: LineString = {
      type: "LineString",
      coordinates: [
        [GRANBY.longitude, GRANBY.latitude],
        [east.longitude, east.latitude],
        [northEast.longitude, northEast.latitude],
        [north.longitude, north.latitude],
        [offsetCoordinates(GRANBY, 270, 10).longitude, GRANBY.latitude],
        [GRANBY.longitude, GRANBY.latitude],
      ],
    };

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
