import { describe, expect, it } from "vitest";
import { haversineKm, offsetCoordinates } from "@/domain/geo/distance";
import type { Coordinates, LineString } from "@/domain/geo/types";
import {
  composeRoundTripCandidate,
  createReturnWaypointSets,
  evaluateRoundTripCandidate,
  selectBestRoundTripCandidate,
} from "./round-trip";
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
): DestinationCandidate {
  return {
    geometry: densify({
      type: "LineString",
      coordinates: points.map((point) => [point.longitude, point.latitude]),
    }),
    segments: [],
    distanceKm,
    durationMinutes: distanceKm,
    waypoints: [],
  };
}

function sameRoadOutbound(): DestinationCandidate {
  const east = offsetCoordinates(GRANBY, 90, 40);
  const mid = offsetCoordinates(east, 0, haversineKm(east, TREMBLANT) / 2);
  return candidateFromPoints([GRANBY, east, mid, TREMBLANT], 180);
}

function sameRoadInbound(): DestinationCandidate {
  const east = offsetCoordinates(GRANBY, 90, 40);
  const mid = offsetCoordinates(east, 0, haversineKm(east, TREMBLANT) / 2);
  return candidateFromPoints([TREMBLANT, mid, east, GRANBY], 180);
}

function differentReturn(): DestinationCandidate {
  const west = offsetCoordinates(GRANBY, 270, 40);
  const north = offsetCoordinates(west, 0, 50);
  return candidateFromPoints([TREMBLANT, north, west, GRANBY], 210);
}

function evaluatePair(
  outbound: DestinationCandidate,
  inbound: DestinationCandidate,
  targetDistanceKm?: number,
  style: "curvy" | "scenic" | "touring" = "scenic",
) {
  const candidate = composeRoundTripCandidate(outbound, inbound);
  return evaluateRoundTripCandidate(GRANBY, TREMBLANT, candidate, style, {
    targetDistanceKm,
    shortestDistanceKm: candidate.distanceKm,
    shortestOutboundKm: outbound.distanceKm,
    shortestInboundKm: inbound.distanceKm,
  });
}

function withSegments(
  candidate: DestinationCandidate,
  roadClass: string,
  elevationGainM?: number,
  landscapeFeatures?: DestinationCandidate["segments"][number]["landscapeFeatures"],
): DestinationCandidate {
  return {
    ...candidate,
    segments: [
      {
        id: roadClass,
        geometry: candidate.geometry,
        distanceKm: candidate.distanceKm,
        durationMinutes: candidate.durationMinutes,
        roadClass,
        elevationGainM,
        landscapeFeatures,
      },
    ],
  };
}

describe("createReturnWaypointSets (FR-003)", () => {
  it("seeds several return corridors from the destination back to the start", () => {
    const sets = createReturnWaypointSets(GRANBY, TREMBLANT);

    expect(sets.some((set) => set.waypoints.length === 0)).toBe(true);
    expect(sets.filter((set) => set.waypoints.length > 0).length).toBeGreaterThan(
      3,
    );
  });
});

describe("composeRoundTripCandidate (FR-003)", () => {
  it("joins outbound and return without duplicating the destination vertex", () => {
    const outbound = sameRoadOutbound();
    const inbound = differentReturn();
    const composed = composeRoundTripCandidate(outbound, inbound);
    const lastOutbound =
      outbound.geometry.coordinates[outbound.geometry.coordinates.length - 1];
    const firstInbound = inbound.geometry.coordinates[0];

    expect(lastOutbound).toEqual(firstInbound);
    expect(composed.geometry.coordinates.length).toBe(
      outbound.geometry.coordinates.length +
        inbound.geometry.coordinates.length -
        1,
    );
    expect(composed.distanceKm).toBe(390);
  });
});

describe("evaluateRoundTripCandidate (FR-003, BR-002)", () => {
  it("measures high overlap for an out-and-back on the same roadway", () => {
    const evaluation = evaluatePair(sameRoadOutbound(), sameRoadInbound());

    expect(evaluation.startsAtStart).toBe(true);
    expect(evaluation.visitsDestination).toBe(true);
    expect(evaluation.returnsToStart).toBe(true);
    expect(evaluation.outboundReturnOverlapPercent).toBeGreaterThan(80);
    expect(evaluation.warnings.join(" ")).toMatch(/réutilise/);
  });

  it("measures low overlap for a distinct return corridor", () => {
    const evaluation = evaluatePair(sameRoadOutbound(), differentReturn());

    expect(evaluation.outboundReturnOverlapPercent).toBeLessThan(25);
    expect(evaluation.warnings.join(" ")).not.toMatch(/réutilise/);
  });
});

describe("selectBestRoundTripCandidate (FR-003, BR-002)", () => {
  it("rejects a same-road return when a different corridor exists", () => {
    const sameRoad = evaluatePair(sameRoadOutbound(), sameRoadInbound());
    const distinct = evaluatePair(sameRoadOutbound(), differentReturn());

    const selection = selectBestRoundTripCandidate([sameRoad, distinct]);

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.outboundReturnOverlapPercent).toBe(
      distinct.outboundReturnOverlapPercent,
    );
    expect(selection.evaluation.outboundReturnOverlapPercent).toBeLessThan(
      sameRoad.outboundReturnOverlapPercent,
    );
  });

  it("prefers a Curvy-scoring leg when outbound/return overlap is equal (FR-004)", () => {
    const outbound = sameRoadOutbound();
    const inbound = differentReturn();
    const highway = evaluatePair(
      withSegments(outbound, "motorway", 0),
      withSegments(inbound, "motorway", 0),
      undefined,
      "curvy",
    );
    const winding = evaluatePair(
      withSegments(outbound, "secondary", 800),
      withSegments(inbound, "secondary", 700),
      undefined,
      "curvy",
    );

    expect(highway.outboundReturnOverlapPercent).toBe(
      winding.outboundReturnOverlapPercent,
    );
    expect(winding.outboundStyleScore + winding.inboundStyleScore).toBeGreaterThan(
      highway.outboundStyleScore + highway.inboundStyleScore,
    );

    const selection = selectBestRoundTripCandidate([highway, winding]);

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.candidate.outbound.segments[0]?.roadClass).toBe(
      "secondary",
    );
  });

  it("prefers a Scenic-scoring leg when outbound/return overlap is equal (FR-005)", () => {
    const outbound = sameRoadOutbound();
    const inbound = differentReturn();
    const highway = evaluatePair(
      withSegments(outbound, "motorway"),
      withSegments(inbound, "motorway"),
      undefined,
      "scenic",
    );
    const panoramic = evaluatePair(
      withSegments(outbound, "unclassified", undefined, [
        "rural",
        "lake",
        "village",
        "panoramic",
      ]),
      withSegments(inbound, "unclassified", undefined, [
        "rural",
        "river",
        "viewpoint",
      ]),
      undefined,
      "scenic",
    );

    expect(highway.outboundReturnOverlapPercent).toBe(
      panoramic.outboundReturnOverlapPercent,
    );
    expect(
      panoramic.outboundStyleScore + panoramic.inboundStyleScore,
    ).toBeGreaterThan(highway.outboundStyleScore + highway.inboundStyleScore);

    const selection = selectBestRoundTripCandidate([highway, panoramic]);

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.candidate.outbound.segments[0]?.roadClass).toBe(
      "unclassified",
    );
  });

  it("explains a BR-001 miss instead of widening the tolerance", () => {
    const far = evaluatePair(sameRoadOutbound(), differentReturn(), 200);

    const selection = selectBestRoundTripCandidate([far], 200);

    expect(selection.status).toBe("distance_out_of_tolerance");
    if (selection.status !== "distance_out_of_tolerance") {
      return;
    }
    expect(selection.evaluation.candidate.distanceKm).toBe(390);
  });
});
