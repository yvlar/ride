import { appendFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { offsetCoordinates } from "@/domain/geo/distance";
import type { Coordinates, LineString } from "@/domain/geo/types";
import { CURVY_UNKNOWN_ELEVATION_SCORE } from "./constants";
import {
  curvyRankScore,
  elevationScore,
  measureCurvySignals,
  scoreCurvyBreakdown,
} from "./curvy";
import type { RouteSegment } from "./types";

const GRANBY: Coordinates = { latitude: 45.403, longitude: -72.734 };

function densify(points: Coordinates[], pointsPerSegment = 3): LineString {
  const coordinates: LineString["coordinates"] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    for (let step = 0; step < pointsPerSegment; step += 1) {
      const t = step / pointsPerSegment;
      coordinates.push([
        from.longitude + (to.longitude - from.longitude) * t,
        from.latitude + (to.latitude - from.latitude) * t,
      ]);
    }
  }
  const last = points[points.length - 1];
  if (last) {
    coordinates.push([last.longitude, last.latitude]);
  }
  return { type: "LineString", coordinates };
}

function straightGeometry(): LineString {
  const east = offsetCoordinates(GRANBY, 90, 20);
  const farther = offsetCoordinates(east, 90, 20);
  return densify([GRANBY, east, farther], 6);
}

function windingGeometry(): LineString {
  const east = offsetCoordinates(GRANBY, 90, 8);
  const north = offsetCoordinates(east, 0, 8);
  const west = offsetCoordinates(north, 270, 8);
  const south = offsetCoordinates(west, 180, 8);
  const finish = offsetCoordinates(south, 90, 8);
  return densify([GRANBY, east, north, west, south, finish], 3);
}

function segment(partial: Partial<RouteSegment> & { distanceKm: number }): RouteSegment {
  return {
    id: partial.id ?? "seg",
    geometry: partial.geometry ?? { type: "LineString", coordinates: [] },
    distanceKm: partial.distanceKm,
    durationMinutes: partial.durationMinutes ?? partial.distanceKm,
    roadClass: partial.roadClass,
    elevationGainM: partial.elevationGainM,
    surface: partial.surface,
    roadName: partial.roadName,
  };
}

describe("measureCurvySignals (FR-004)", () => {
  it("scores frequent direction changes higher than a long straight", () => {
    const straight = measureCurvySignals(straightGeometry());
    const winding = measureCurvySignals(windingGeometry());

    expect(winding.headingChangePerKm).toBeGreaterThan(straight.headingChangePerKm);
    expect(winding.significantTurnsPerKm).toBeGreaterThan(
      straight.significantTurnsPerKm,
    );
    expect(winding.longestStraightShare).toBeLessThan(straight.longestStraightShare);
  });

  it("treats a long aligned run as a straight corridor to avoid", () => {
    const straight = measureCurvySignals(straightGeometry());

    expect(straight.longestStraightShare).toBeGreaterThan(0.85);
    expect(straight.significantTurnsPerKm).toBe(0);
  });

  it("measures secondary and highway shares from segment classes", () => {
    const signals = measureCurvySignals(windingGeometry(), [
      segment({ distanceKm: 30, roadClass: "secondary" }),
      segment({ distanceKm: 10, roadClass: "motorway" }),
    ]);

    expect(signals.secondaryRoadPercent).toBe(75);
    expect(signals.highwayPercent).toBe(25);
  });

  it("leaves elevation unknown when no segment reports climb", () => {
    const signals = measureCurvySignals(windingGeometry(), [
      segment({ distanceKm: 20, roadClass: "secondary" }),
    ]);

    expect(signals.elevationGainMPerKm).toBeNull();
    expect(elevationScore(signals)).toBe(CURVY_UNKNOWN_ELEVATION_SCORE);
  });

  it("measures elevation gain per kilometre when segments expose it", () => {
    const signals = measureCurvySignals(windingGeometry(), [
      segment({ distanceKm: 20, elevationGainM: 400 }),
      segment({ distanceKm: 20, elevationGainM: 200 }),
    ]);

    expect(signals.elevationGainMPerKm).toBe(15);
  });
});

describe("curvyRankScore (FR-004, BR-003)", () => {
  it("prefers a winding secondary corridor over a highway straight", () => {
    const winding = curvyRankScore(windingGeometry(), [
      segment({ distanceKm: 40, roadClass: "secondary", elevationGainM: 600 }),
    ]);
    const highway = curvyRankScore(straightGeometry(), [
      segment({ distanceKm: 40, roadClass: "motorway", elevationGainM: 0 }),
    ]);

    expect(winding).toBeGreaterThan(highway);
  });

  it("prefers secondary roads over an otherwise similar highway corridor", () => {
    const geometry = windingGeometry();
    const secondary = curvyRankScore(geometry, [
      segment({ distanceKm: 40, roadClass: "secondary" }),
    ]);
    const highway = curvyRankScore(geometry, [
      segment({ distanceKm: 40, roadClass: "trunk" }),
    ]);

    expect(secondary).toBeGreaterThan(highway);
  });

  it("prefers known elevation change over a flat corridor of the same class", () => {
    const geometry = windingGeometry();
    const climbing = curvyRankScore(geometry, [
      segment({ distanceKm: 40, roadClass: "secondary", elevationGainM: 800 }),
    ]);
    const flat = curvyRankScore(geometry, [
      segment({ distanceKm: 40, roadClass: "secondary", elevationGainM: 0 }),
    ]);

    expect(climbing).toBeGreaterThan(flat);
  });

  it("does not invent relief when elevation is unknown", () => {
    const knownFlat = scoreCurvyBreakdown(
      measureCurvySignals(windingGeometry(), [
        segment({ distanceKm: 40, roadClass: "secondary", elevationGainM: 0 }),
      ]),
    );
    const unknown = scoreCurvyBreakdown(
      measureCurvySignals(windingGeometry(), [
        segment({ distanceKm: 40, roadClass: "secondary" }),
      ]),
    );

    expect(unknown.elevation).toBe(CURVY_UNKNOWN_ELEVATION_SCORE);
    expect(unknown.elevation).toBeGreaterThan(knownFlat.elevation);
  });

  it("debug A/B/C: log unknown vs known / partial / flat elevation (FR-004)", () => {
    const geometry = windingGeometry();

    const unknownA = scoreCurvyBreakdown(
      measureCurvySignals(geometry, [segment({ distanceKm: 40, roadClass: "secondary" })]),
    );
    const known10mPerKm = scoreCurvyBreakdown(
      measureCurvySignals(geometry, [
        segment({ distanceKm: 40, roadClass: "secondary", elevationGainM: 400 }),
      ]),
    );

    const unknownB = scoreCurvyBreakdown(
      measureCurvySignals(
        geometry,
        Array.from({ length: 10 }, (_, index) =>
          segment({ id: `u${index}`, distanceKm: 10, roadClass: "secondary" }),
        ),
      ),
    );
    const partialOneOfTen = scoreCurvyBreakdown(
      measureCurvySignals(geometry, [
        segment({ id: "p0", distanceKm: 10, roadClass: "secondary", elevationGainM: 100 }),
        ...Array.from({ length: 9 }, (_, index) =>
          segment({ id: `p${index + 1}`, distanceKm: 10, roadClass: "secondary" }),
        ),
      ]),
    );

    const unknownC = scoreCurvyBreakdown(
      measureCurvySignals(geometry, [segment({ distanceKm: 40, roadClass: "secondary" })]),
    );
    const knownFlat = scoreCurvyBreakdown(
      measureCurvySignals(geometry, [
        segment({ distanceKm: 40, roadClass: "secondary", elevationGainM: 0 }),
      ]),
    );

    const rankUnknownA = curvyRankScore(geometry, [
      segment({ distanceKm: 40, roadClass: "secondary" }),
    ]);
    const rankKnown10 = curvyRankScore(geometry, [
      segment({ distanceKm: 40, roadClass: "secondary", elevationGainM: 400 }),
    ]);
    const rankUnknownB = curvyRankScore(
      geometry,
      Array.from({ length: 10 }, (_, index) =>
        segment({ id: `ru${index}`, distanceKm: 10, roadClass: "secondary" }),
      ),
    );
    const rankPartial = curvyRankScore(geometry, [
      segment({ id: "rp0", distanceKm: 10, roadClass: "secondary", elevationGainM: 100 }),
      ...Array.from({ length: 9 }, (_, index) =>
        segment({ id: `rp${index + 1}`, distanceKm: 10, roadClass: "secondary" }),
      ),
    ]);
    const rankUnknownC = curvyRankScore(geometry, [
      segment({ distanceKm: 40, roadClass: "secondary" }),
    ]);
    const rankKnownFlat = curvyRankScore(geometry, [
      segment({ distanceKm: 40, roadClass: "secondary", elevationGainM: 0 }),
    ]);

    // #region agent log
    appendFileSync(
      "/opt/cursor/logs/debug.log",
      `${JSON.stringify({
        hypothesisId: "C",
        location: "curvy.test.ts:debug-ABC",
        message: "case A/B/C numeric scores",
        data: {
          A: {
            unknownElevation: unknownA.elevation,
            unknownTotal: unknownA.total,
            known10mPerKmElevation: known10mPerKm.elevation,
            known10mPerKmTotal: known10mPerKm.total,
            unknownBeatsKnown10: unknownA.total > known10mPerKm.total,
            rankUnknown: rankUnknownA,
            rankKnown10: rankKnown10,
          },
          B: {
            unknownElevation: unknownB.elevation,
            unknownTotal: unknownB.total,
            partialElevation: partialOneOfTen.elevation,
            partialTotal: partialOneOfTen.total,
            unknownBeatsPartial: unknownB.total > partialOneOfTen.total,
            rankUnknown: rankUnknownB,
            rankPartial: rankPartial,
          },
          C: {
            unknownElevation: unknownC.elevation,
            unknownTotal: unknownC.total,
            knownFlatElevation: knownFlat.elevation,
            knownFlatTotal: knownFlat.total,
            unknownBeatsKnownFlat: unknownC.total > knownFlat.total,
            rankUnknown: rankUnknownC,
            rankKnownFlat: rankKnownFlat,
          },
        },
        timestamp: Date.now(),
      })}\n`,
    );
    // #endregion

    expect(unknownA.elevation).toBe(CURVY_UNKNOWN_ELEVATION_SCORE);
    expect(unknownB.elevation).toBe(CURVY_UNKNOWN_ELEVATION_SCORE);
    expect(unknownC.elevation).toBe(CURVY_UNKNOWN_ELEVATION_SCORE);
    expect(known10mPerKm.total).toBe(rankKnown10);
    expect(partialOneOfTen.total).toBe(rankPartial);
    expect(knownFlat.total).toBe(rankKnownFlat);
    expect(rankUnknownA).toBe(unknownA.total);
    expect(rankUnknownB).toBe(unknownB.total);
    expect(rankUnknownC).toBe(unknownC.total);
  });

  it("does not use duration or fastest-path time as an input (BR-003)", () => {
    const geometry = windingGeometry();
    const segments = [segment({ distanceKm: 40, roadClass: "secondary" })];

    expect(curvyRankScore(geometry, segments)).toBe(
      curvyRankScore(geometry, [
        segment({ ...segments[0]!, durationMinutes: 12 }),
      ]),
    );
    expect(curvyRankScore(geometry, segments)).toBe(
      curvyRankScore(geometry, [
        segment({ ...segments[0]!, durationMinutes: 240 }),
      ]),
    );
  });
});
