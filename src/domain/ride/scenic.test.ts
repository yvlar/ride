import { describe, expect, it } from "vitest";
import { offsetCoordinates } from "@/domain/geo/distance";
import type { Coordinates, LineString } from "@/domain/geo/types";
import {
  landscapeScore,
  measureScenicSignals,
  ruralRoadsScore,
  scenicAvoidanceScore,
  scenicRankScore,
  scoreScenicBreakdown,
} from "./scenic";
import type { RouteSegment, ScenicLandscapeFeature } from "./types";

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

const LAKE_VILLAGE: ScenicLandscapeFeature[] = [
  "rural",
  "lake",
  "village",
  "panoramic",
];

describe("measureScenicSignals (FR-005)", () => {
  it("measures rural, highway, and landscape shares from segments", () => {
    const signals = measureScenicSignals(straightGeometry(), [
      segment({
        distanceKm: 30,
        roadClass: "unclassified",
        landscapeFeatures: ["lake", "village"],
      }),
      segment({ distanceKm: 10, roadClass: "motorway" }),
    ]);

    expect(signals.ruralRoadPercent).toBe(75);
    expect(signals.highwayPercent).toBe(25);
    expect(signals.waterPercent).toBe(75);
    expect(signals.villagePercent).toBe(75);
    expect(signals.hasKnownLandscape).toBe(true);
  });

  it("does not invent water, viewpoints, or villages when unlabeled", () => {
    const signals = measureScenicSignals(windingGeometry(), [
      segment({ distanceKm: 40, roadClass: "secondary" }),
    ]);

    expect(signals.waterPercent).toBe(0);
    expect(signals.viewpointPercent).toBe(0);
    expect(signals.villagePercent).toBe(0);
    expect(signals.panoramicPercent).toBe(0);
    expect(signals.hasKnownLandscape).toBe(false);
    expect(landscapeScore(signals)).toBe(0);
  });

  it("does not invent mountains when elevation is unknown", () => {
    const unlabeled = measureScenicSignals(windingGeometry(), [
      segment({ distanceKm: 40, roadClass: "tertiary" }),
    ]);
    const knownFlat = measureScenicSignals(windingGeometry(), [
      segment({ distanceKm: 40, roadClass: "tertiary", elevationGainM: 0 }),
    ]);

    expect(unlabeled.elevationGainMPerKm).toBeNull();
    expect(unlabeled.mountainPercent).toBe(0);
    expect(knownFlat.mountainPercent).toBe(0);
    expect(landscapeScore(unlabeled)).toBe(0);
    expect(landscapeScore(knownFlat)).toBe(0);
  });

  it("treats known climb as a mountain signal when no mountain tag is present", () => {
    const signals = measureScenicSignals(windingGeometry(), [
      segment({ distanceKm: 20, roadClass: "tertiary", elevationGainM: 600 }),
    ]);

    expect(signals.elevationGainMPerKm).toBe(30);
    expect(signals.mountainPercent).toBe(100);
    expect(signals.hasKnownLandscape).toBe(true);
  });
});

describe("scenicRankScore (FR-005, BR-003)", () => {
  it("prefers a rural lake-and-village corridor over a highway", () => {
    const scenic = scenicRankScore(straightGeometry(), [
      segment({
        distanceKm: 40,
        roadClass: "unclassified",
        landscapeFeatures: LAKE_VILLAGE,
      }),
    ]);
    const highway = scenicRankScore(straightGeometry(), [
      segment({ distanceKm: 40, roadClass: "motorway", elevationGainM: 0 }),
    ]);

    expect(scenic).toBeGreaterThan(highway);
  });

  it("prefers known landscape over a twistier corridor without scenic tags", () => {
    const panoramic = scenicRankScore(straightGeometry(), [
      segment({
        distanceKm: 40,
        roadClass: "tertiary",
        landscapeFeatures: LAKE_VILLAGE,
      }),
    ]);
    const twistyOnly = scenicRankScore(windingGeometry(), [
      segment({
        distanceKm: 40,
        roadClass: "secondary",
      }),
    ]);

    expect(panoramic).toBeGreaterThan(twistyOnly);
  });

  it("prefers a tagged mountain or climb over a flat rural corridor", () => {
    const geometry = straightGeometry();
    const climbing = scenicRankScore(geometry, [
      segment({
        distanceKm: 40,
        roadClass: "tertiary",
        elevationGainM: 800,
        landscapeFeatures: ["rural"],
      }),
    ]);
    const flat = scenicRankScore(geometry, [
      segment({
        distanceKm: 40,
        roadClass: "tertiary",
        elevationGainM: 0,
        landscapeFeatures: ["rural"],
      }),
    ]);

    expect(climbing).toBeGreaterThan(flat);
  });

  it("penalizes industrial corridors against otherwise similar rural roads", () => {
    const geometry = straightGeometry();
    const rural = scenicRankScore(geometry, [
      segment({ distanceKm: 40, roadClass: "unclassified" }),
    ]);
    const industrial = scenicRankScore(geometry, [
      segment({
        distanceKm: 40,
        roadClass: "service",
        landscapeFeatures: ["industrial"],
      }),
    ]);

    expect(rural).toBeGreaterThan(industrial);
  });

  it("scores landscape, rural, and avoidance independently (FR-005)", () => {
    const scenic = measureScenicSignals(straightGeometry(), [
      segment({
        distanceKm: 30,
        roadClass: "unclassified",
        landscapeFeatures: ["lake", "village", "panoramic"],
      }),
      segment({ distanceKm: 10, roadClass: "motorway" }),
    ]);
    const highway = measureScenicSignals(straightGeometry(), [
      segment({ distanceKm: 40, roadClass: "motorway" }),
    ]);

    expect(landscapeScore(scenic)).toBeGreaterThan(landscapeScore(highway));
    expect(ruralRoadsScore(scenic)).toBe(75);
    expect(scenicAvoidanceScore(scenic)).toBe(50);
    expect(ruralRoadsScore(highway)).toBe(0);
    expect(scenicAvoidanceScore(highway)).toBe(0);
    expect(landscapeScore(highway)).toBe(0);
  });

  it("does not use duration or fastest-path time as an input (BR-003)", () => {
    const geometry = straightGeometry();
    const segments = [
      segment({
        distanceKm: 40,
        roadClass: "unclassified",
        landscapeFeatures: LAKE_VILLAGE,
      }),
    ];

    expect(scenicRankScore(geometry, segments)).toBe(
      scenicRankScore(geometry, [
        segment({ ...segments[0]!, durationMinutes: 12 }),
      ]),
    );
    expect(scenicRankScore(geometry, segments)).toBe(
      scenicRankScore(geometry, [
        segment({ ...segments[0]!, durationMinutes: 240 }),
      ]),
    );
  });

  it("keeps unknown landscape at zero instead of a mid-scale default", () => {
    const unknown = scoreScenicBreakdown(windingGeometry(), [
      segment({ distanceKm: 40, roadClass: "secondary" }),
    ]);

    expect(unknown.landscape).toBe(0);
  });
});
