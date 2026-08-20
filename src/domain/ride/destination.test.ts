import { describe, expect, it } from "vitest";
import { haversineKm, offsetCoordinates } from "@/domain/geo/distance";
import type { Coordinates, LineString } from "@/domain/geo/types";
import { MAX_DESTINATION_DETOUR_RATIO } from "./constants";
import {
  createDestinationWaypointSets,
  evaluateDestinationCandidate,
  maxAllowedDestinationDistanceKm,
  selectBestDestinationCandidate,
  styleRankScore,
} from "./destination";
import type { DestinationCandidate } from "./types";

const GRANBY: Coordinates = { latitude: 45.403, longitude: -72.734 };
const TREMBLANT: Coordinates = { latitude: 46.118, longitude: -74.596 };

function densify(geometry: LineString, pointsPerSegment = 4): LineString {
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

function candidateFromPoints(
  points: Coordinates[],
  distanceKm: number,
  durationMinutes = distanceKm,
): DestinationCandidate {
  return {
    geometry: densify({
      type: "LineString",
      coordinates: points.map((point) => [point.longitude, point.latitude]),
    }),
    segments: [],
    distanceKm,
    durationMinutes,
    waypoints: [],
  };
}

function fastestCandidate(): DestinationCandidate {
  const mid = offsetCoordinates(GRANBY, 315, haversineKm(GRANBY, TREMBLANT) / 2);
  return candidateFromPoints([GRANBY, mid, TREMBLANT], 180, 120);
}

function curvyCandidate(): DestinationCandidate {
  const east = offsetCoordinates(GRANBY, 90, 25);
  const north = offsetCoordinates(east, 0, 40);
  const west = offsetCoordinates(north, 270, 80);
  return candidateFromPoints(
    [GRANBY, east, north, west, TREMBLANT],
    210,
    180,
  );
}

describe("createDestinationWaypointSets (FR-002)", () => {
  it("includes a direct corridor and several lateral seeds", () => {
    const sets = createDestinationWaypointSets(GRANBY, TREMBLANT);

    expect(sets.some((set) => set.waypoints.length === 0)).toBe(true);
    expect(sets.length).toBeGreaterThan(4);
    expect(
      sets.filter((set) => set.waypoints.length > 0).length,
    ).toBeGreaterThan(3);
  });

  it("adds lengthened corridors when a target distance is provided", () => {
    const withoutTarget = createDestinationWaypointSets(GRANBY, TREMBLANT);
    const withTarget = createDestinationWaypointSets(GRANBY, TREMBLANT, 320);

    expect(withTarget.length).toBeGreaterThan(withoutTarget.length);
  });
});

describe("evaluateDestinationCandidate (FR-002)", () => {
  it("anchors a path that starts at the start and ends at the destination", () => {
    const evaluation = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      fastestCandidate(),
      { shortestDistanceKm: 180 },
    );

    expect(evaluation.startsAtStart).toBe(true);
    expect(evaluation.reachesDestination).toBe(true);
    expect(evaluation.followsRoadNetwork).toBe(true);
    expect(evaluation.withinDistanceTolerance).toBeNull();
  });

  it("marks a 3x detour as disproportionate when no target length is set", () => {
    const evaluation = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      { ...curvyCandidate(), distanceKm: 540 },
      { shortestDistanceKm: 180 },
    );

    expect(evaluation.disproportionateDetour).toBe(true);
  });
});

describe("maxAllowedDestinationDistanceKm (FR-002)", () => {
  it("caps detours at the configured ratio without a target", () => {
    expect(maxAllowedDestinationDistanceKm(100)).toBe(
      100 * MAX_DESTINATION_DETOUR_RATIO,
    );
  });

  it("allows stretching up to the BR-001 maximum when a target is set", () => {
    expect(maxAllowedDestinationDistanceKm(100, 200)).toBe(220);
  });
});

describe("selectBestDestinationCandidate (FR-002, BR-003)", () => {
  const shortest = evaluateDestinationCandidate(
    GRANBY,
    TREMBLANT,
    fastestCandidate(),
    { shortestDistanceKm: 180 },
  );
  const twistier = evaluateDestinationCandidate(
    GRANBY,
    TREMBLANT,
    curvyCandidate(),
    { shortestDistanceKm: 180 },
  );

  it("prefers the curvier corridor over the fastest candidate", () => {
    expect(twistier.headingChangePerKm).toBeGreaterThan(
      shortest.headingChangePerKm,
    );
    expect(styleRankScore("curvy", twistier, 180)).toBeGreaterThan(
      styleRankScore("curvy", shortest, 180),
    );

    const selection = selectBestDestinationCandidate(
      [shortest, twistier],
      "curvy",
    );

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.candidate.durationMinutes).toBe(180);
    expect(selection.evaluation.candidate.distanceKm).toBe(210);
  });

  it("does not rank by duration even when the twistier route is slower", () => {
    const evenSlower = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      { ...curvyCandidate(), durationMinutes: 240 },
      { shortestDistanceKm: 180 },
    );

    const selection = selectBestDestinationCandidate(
      [shortest, evenSlower],
      "curvy",
    );

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.candidate.durationMinutes).toBe(240);
  });

  it("explains a BR-001 miss instead of widening the tolerance", () => {
    const far = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      { ...fastestCandidate(), distanceKm: 400 },
      { targetDistanceKm: 200, shortestDistanceKm: 400 },
    );

    const selection = selectBestDestinationCandidate([far], "touring", 200);

    expect(selection.status).toBe("distance_out_of_tolerance");
    if (selection.status !== "distance_out_of_tolerance") {
      return;
    }
    expect(selection.evaluation.candidate.distanceKm).toBe(400);
  });
});
