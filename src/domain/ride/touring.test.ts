import { describe, expect, it } from "vitest";
import { offsetCoordinates } from "@/domain/geo/distance";
import type { Coordinates, LineString } from "@/domain/geo/types";
import { curvyRankScore } from "./curvy";
import {
  comfortScore,
  fluidityScore,
  measureTouringSignals,
  scoreTouringBreakdown,
  touringHighwayAvoidanceScore,
  touringRankScore,
  touringSecondaryRoadsScore,
} from "./touring";
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

function rollingGeometry(): LineString {
  const points: Coordinates[] = [GRANBY];
  let cursor = GRANBY;
  let bearing = 90;
  for (let index = 0; index < 6; index += 1) {
    cursor = offsetCoordinates(cursor, bearing, 8);
    points.push(cursor);
    bearing = (bearing + 25) % 360;
  }
  return densify(points, 3);
}

function hairpinGeometry(): LineString {
  const points: Coordinates[] = [GRANBY];
  let cursor = GRANBY;
  let bearing = 90;
  for (let index = 0; index < 5; index += 1) {
    cursor = offsetCoordinates(cursor, bearing, 8);
    points.push(cursor);
    bearing = (bearing + 160) % 360;
  }
  return densify(points, 3);
}

function segment(
  partial: Partial<RouteSegment> & { distanceKm: number },
): RouteSegment {
  return {
    id: partial.id ?? "seg",
    geometry: partial.geometry ?? { type: "LineString", coordinates: [] },
    distanceKm: partial.distanceKm,
    durationMinutes: partial.durationMinutes ?? partial.distanceKm,
    roadClass: partial.roadClass,
    elevationGainM: partial.elevationGainM,
    surface: partial.surface,
    roadName: partial.roadName,
    landscapeFeatures: partial.landscapeFeatures,
  };
}

describe("measureTouringSignals (FR-006)", () => {
  it("measures secondary, highway, and surface shares from segments", () => {
    const signals = measureTouringSignals(rollingGeometry(), [
      segment({ distanceKm: 30, roadClass: "secondary", surface: "paved" }),
      segment({ distanceKm: 10, roadClass: "motorway", surface: "paved" }),
    ]);

    expect(signals.secondaryRoadPercent).toBe(75);
    expect(signals.highwayPercent).toBe(25);
    expect(signals.pavedPercent).toBe(100);
    expect(signals.unpavedPercent).toBe(0);
    expect(signals.unknownSurfacePercent).toBe(0);
  });

  it("does not invent pavement when the surface is unknown", () => {
    const signals = measureTouringSignals(rollingGeometry(), [
      segment({ distanceKm: 40, roadClass: "secondary" }),
    ]);

    expect(signals.pavedPercent).toBe(0);
    expect(signals.unpavedPercent).toBe(0);
    expect(signals.unknownSurfacePercent).toBe(100);
    expect(comfortScore(signals)).toBe(0);
  });

  it("treats a known unpaved secondary as uncomfortable", () => {
    const signals = measureTouringSignals(rollingGeometry(), [
      segment({ distanceKm: 40, roadClass: "secondary", surface: "unpaved" }),
    ]);

    expect(signals.unpavedPercent).toBe(100);
    expect(comfortScore(signals)).toBe(0);
  });
});

describe("touringRankScore (FR-006, BR-003)", () => {
  it("prefers a paved secondary corridor over a faster highway", () => {
    const touring = touringRankScore(rollingGeometry(), [
      segment({ distanceKm: 40, roadClass: "secondary", surface: "paved" }),
    ]);
    const highway = touringRankScore(straightGeometry(), [
      segment({
        distanceKm: 40,
        roadClass: "motorway",
        surface: "paved",
        durationMinutes: 20,
      }),
    ]);

    expect(touring).toBeGreaterThan(highway);
  });

  it("prefers a rolling corridor over a technical hairpin corridor (FR-006)", () => {
    const rolling = touringRankScore(rollingGeometry(), [
      segment({ distanceKm: 40, roadClass: "secondary", surface: "paved" }),
    ]);
    const hairpins = touringRankScore(hairpinGeometry(), [
      segment({ distanceKm: 40, roadClass: "secondary", surface: "paved" }),
    ]);

    expect(fluidityScore(measureTouringSignals(rollingGeometry()))).toBeGreaterThan(
      fluidityScore(measureTouringSignals(hairpinGeometry())),
    );
    expect(rolling).toBeGreaterThan(hairpins);
  });

  it("is less technical than Curvy on the same pair of corridors (FR-006)", () => {
    const rollingSegments = [
      segment({ distanceKm: 40, roadClass: "secondary", surface: "paved" }),
    ];
    const hairpinSegments = [
      segment({ distanceKm: 40, roadClass: "secondary", surface: "paved" }),
    ];

    expect(touringRankScore(rollingGeometry(), rollingSegments)).toBeGreaterThan(
      touringRankScore(hairpinGeometry(), hairpinSegments),
    );
    expect(curvyRankScore(hairpinGeometry(), hairpinSegments)).toBeGreaterThan(
      curvyRankScore(rollingGeometry(), rollingSegments),
    );
  });

  it("prefers paved secondary over an otherwise similar unpaved secondary", () => {
    const geometry = rollingGeometry();
    const paved = touringRankScore(geometry, [
      segment({ distanceKm: 40, roadClass: "secondary", surface: "paved" }),
    ]);
    const unpaved = touringRankScore(geometry, [
      segment({ distanceKm: 40, roadClass: "secondary", surface: "unpaved" }),
    ]);

    expect(paved).toBeGreaterThan(unpaved);
  });

  it("scores fluidity, secondary, comfort, and highway independently (FR-006)", () => {
    const touring = measureTouringSignals(rollingGeometry(), [
      segment({ distanceKm: 30, roadClass: "secondary", surface: "paved" }),
      segment({ distanceKm: 10, roadClass: "motorway", surface: "paved" }),
    ]);
    const highway = measureTouringSignals(straightGeometry(), [
      segment({ distanceKm: 40, roadClass: "motorway", surface: "paved" }),
    ]);

    expect(fluidityScore(touring)).toBeGreaterThan(fluidityScore(highway) * 0.5);
    expect(touringSecondaryRoadsScore(touring)).toBe(75);
    expect(comfortScore(touring)).toBe(100);
    expect(touringHighwayAvoidanceScore(touring)).toBe(50);
    expect(touringSecondaryRoadsScore(highway)).toBe(0);
    expect(touringHighwayAvoidanceScore(highway)).toBe(0);
  });

  it("does not use duration or fastest-path time as an input (BR-003)", () => {
    const geometry = rollingGeometry();
    const segments = [
      segment({ distanceKm: 40, roadClass: "secondary", surface: "paved" }),
    ];

    expect(touringRankScore(geometry, segments)).toBe(
      touringRankScore(geometry, [
        segment({ ...segments[0]!, durationMinutes: 12 }),
      ]),
    );
    expect(touringRankScore(geometry, segments)).toBe(
      touringRankScore(geometry, [
        segment({ ...segments[0]!, durationMinutes: 240 }),
      ]),
    );
  });

  it("keeps unknown comfort at zero instead of a mid-scale default", () => {
    const unknown = scoreTouringBreakdown(rollingGeometry(), [
      segment({ distanceKm: 40, roadClass: "secondary" }),
    ]);
    const knownPaved = scoreTouringBreakdown(rollingGeometry(), [
      segment({ distanceKm: 40, roadClass: "secondary", surface: "paved" }),
    ]);

    expect(unknown.comfort).toBe(0);
    expect(knownPaved.comfort).toBe(100);
    expect(knownPaved.total).toBeGreaterThan(unknown.total);
  });

  it("does not collapse to the twistiest corridor when a fluid alternative exists", () => {
    const rolling = touringRankScore(rollingGeometry(), [
      segment({ distanceKm: 40, roadClass: "secondary", surface: "paved" }),
    ]);
    const winding = touringRankScore(windingGeometry(), [
      segment({ distanceKm: 40, roadClass: "secondary", surface: "paved" }),
    ]);

    expect(rolling).toBeGreaterThan(winding);
  });
});
