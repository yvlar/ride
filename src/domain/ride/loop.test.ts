import { describe, expect, it } from "vitest";
import { offsetCoordinates } from "@/domain/geo/distance";
import { createCircleLineString } from "@/domain/geo/geometry";
import type { Coordinates, LineString } from "@/domain/geo/types";
import { isInUnitedStates } from "@/domain/geo/united-states";
import { HIGH_REPEAT_WARNING_PERCENT } from "./constants";
import { HIGHWAY_AVOIDANCE_WARNING } from "./highways";
import { UNKNOWN_SURFACE_WARNING } from "./surfaces";
import {
  createLoopWaypointSets,
  evaluateLoopCandidate,
  selectBestLoopCandidate,
  type EvaluatedLoopCandidate,
} from "./loop";
import type { LoopCandidate, RouteSegment } from "./types";

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

function stubLoopEvaluation(input: {
  repeatedRoadPercent: number;
  curvyScore?: number;
  scenicScore?: number;
  touringScore?: number;
  roadClass: string;
  landscapeFeatures?: RouteSegment["landscapeFeatures"];
  surface?: RouteSegment["surface"];
}): EvaluatedLoopCandidate {
  const east = offsetCoordinates(GRANBY, 90, 20);
  const northEast = offsetCoordinates(east, 0, 20);
  const north = offsetCoordinates(GRANBY, 0, 20);
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

  return {
    candidate: {
      ...candidateFromGeometry(geometry, 80),
      segments: [
        {
          id: `stub-${input.roadClass}`,
          geometry,
          distanceKm: 80,
          durationMinutes: 80,
          roadClass: input.roadClass,
          landscapeFeatures: input.landscapeFeatures,
          surface: input.surface,
        } satisfies RouteSegment,
      ],
    },
    isClosed: true,
    followsRoadNetwork: true,
    isGeometricCircle: false,
    withinDistanceTolerance: true,
    repeatedRoadPercent: input.repeatedRoadPercent,
    curvyScore: input.curvyScore ?? 0,
    scenicScore: input.scenicScore ?? 0,
    touringScore: input.touringScore ?? 0,
    warnings: [],
  };
}

describe("createLoopWaypointSets (FR-001)", () => {
  it("seeds several asymmetric waypoint rings around the start", () => {
    const sets = createLoopWaypointSets(GRANBY, 80);

    expect(sets).toHaveLength(8);
    expect(sets[0]?.waypoints.length).toBeGreaterThanOrEqual(3);
    const distances = (sets[0]?.waypoints ?? []).map((point) =>
      Math.hypot(
        point.latitude - GRANBY.latitude,
        point.longitude - GRANBY.longitude,
      ),
    );
    expect(Math.max(...distances) - Math.min(...distances)).toBeGreaterThan(
      0.01,
    );
    for (const point of sets[0]?.waypoints ?? []) {
      expect(point.latitude).not.toBeCloseTo(GRANBY.latitude, 4);
    }
  });

  it("drops loop seeds that land in the United States (FR-028)", () => {
    const niagaraOnTheLake = {
      latitude: 43.2554,
      longitude: -79.0712,
    };
    const unrestricted = createLoopWaypointSets(niagaraOnTheLake, 120);
    const canadian = createLoopWaypointSets(niagaraOnTheLake, 120, true);

    expect(canadian.length).toBeGreaterThan(0);
    expect(canadian.length).toBeLessThan(unrestricted.length);
    for (const set of canadian) {
      for (const point of set.waypoints) {
        expect(isInUnitedStates(point)).toBe(false);
      }
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

  it("prefers a winding secondary loop over a highway rectangle when style is curvy (FR-004)", () => {
    const east = offsetCoordinates(GRANBY, 90, 20);
    const northEast = offsetCoordinates(east, 0, 20);
    const north = offsetCoordinates(GRANBY, 0, 20);
    const rectangle = densify({
      type: "LineString",
      coordinates: [
        [GRANBY.longitude, GRANBY.latitude],
        [east.longitude, east.latitude],
        [northEast.longitude, northEast.latitude],
        [north.longitude, north.latitude],
        [GRANBY.longitude, GRANBY.latitude],
      ],
    });

    const jogEast = offsetCoordinates(GRANBY, 90, 10);
    const jogNorth = offsetCoordinates(jogEast, 0, 10);
    const jogWest = offsetCoordinates(jogNorth, 270, 10);
    const jogSouth = offsetCoordinates(jogWest, 180, 8);
    const farEast = offsetCoordinates(jogSouth, 90, 18);
    const farNorth = offsetCoordinates(farEast, 0, 12);
    const homeNorth = offsetCoordinates(GRANBY, 0, 12);
    const winding = densify({
      type: "LineString",
      coordinates: [
        [GRANBY.longitude, GRANBY.latitude],
        [jogEast.longitude, jogEast.latitude],
        [jogNorth.longitude, jogNorth.latitude],
        [jogWest.longitude, jogWest.latitude],
        [jogSouth.longitude, jogSouth.latitude],
        [farEast.longitude, farEast.latitude],
        [farNorth.longitude, farNorth.latitude],
        [homeNorth.longitude, homeNorth.latitude],
        [GRANBY.longitude, GRANBY.latitude],
      ],
    });

    const highwayLoop: LoopCandidate = {
      ...candidateFromGeometry(rectangle, 80),
      durationMinutes: 50,
      segments: [
        {
          id: "loop-hwy",
          geometry: rectangle,
          distanceKm: 80,
          durationMinutes: 50,
          roadClass: "motorway",
          elevationGainM: 0,
        } satisfies RouteSegment,
      ],
    };
    const curvyLoop: LoopCandidate = {
      ...candidateFromGeometry(winding, 80),
      durationMinutes: 95,
      segments: [
        {
          id: "loop-ridge",
          geometry: winding,
          distanceKm: 80,
          durationMinutes: 95,
          roadClass: "secondary",
          elevationGainM: 700,
        } satisfies RouteSegment,
      ],
    };

    const selection = selectBestLoopCandidate(
      [
        evaluateLoopCandidate(GRANBY, 80, highwayLoop),
        evaluateLoopCandidate(GRANBY, 80, curvyLoop),
      ],
      80,
      "curvy",
    );

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.candidate.segments[0]?.roadClass).toBe(
      "secondary",
    );
    expect(selection.evaluation.curvyScore).toBeGreaterThan(
      evaluateLoopCandidate(GRANBY, 80, highwayLoop).curvyScore,
    );
  });

  it("does not let Curvy outrank a large BR-002 repeat gap (FR-004)", () => {
    const east = offsetCoordinates(GRANBY, 90, 20);
    const northEast = offsetCoordinates(east, 0, 20);
    const north = offsetCoordinates(GRANBY, 0, 20);
    const rectangle = densify({
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

    const cleanHighway: LoopCandidate = {
      ...candidateFromGeometry(rectangle, 80),
      segments: [
        {
          id: "clean-hwy",
          geometry: rectangle,
          distanceKm: 80,
          durationMinutes: 50,
          roadClass: "motorway",
        } satisfies RouteSegment,
      ],
    };
    const repeatedCurvy: LoopCandidate = {
      ...candidateFromGeometry(outAndBack, 80),
      segments: [
        {
          id: "repeat-ridge",
          geometry: outAndBack,
          distanceKm: 80,
          durationMinutes: 95,
          roadClass: "secondary",
          elevationGainM: 800,
        } satisfies RouteSegment,
      ],
    };

    const selection = selectBestLoopCandidate(
      [
        evaluateLoopCandidate(GRANBY, 80, cleanHighway),
        evaluateLoopCandidate(GRANBY, 80, repeatedCurvy),
      ],
      80,
      "curvy",
    );

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.candidate.segments[0]?.roadClass).toBe(
      "motorway",
    );
    expect(selection.evaluation.repeatedRoadPercent).toBeLessThan(
      evaluateLoopCandidate(GRANBY, 80, repeatedCurvy).repeatedRoadPercent,
    );
  });

  it("does not pick a warned Curvy loop over a cleaner alternative (FR-004, BR-002)", () => {
    const warned = stubLoopEvaluation({
      repeatedRoadPercent: 40,
      curvyScore: 90,
      roadClass: "secondary",
    });
    const cleaner = stubLoopEvaluation({
      repeatedRoadPercent: 16,
      curvyScore: 70,
      roadClass: "motorway",
    });

    expect(warned.repeatedRoadPercent).toBeGreaterThan(
      HIGH_REPEAT_WARNING_PERCENT,
    );
    expect(cleaner.repeatedRoadPercent).toBeLessThan(HIGH_REPEAT_WARNING_PERCENT);
    expect(
      warned.repeatedRoadPercent - cleaner.repeatedRoadPercent,
    ).toBeLessThan(HIGH_REPEAT_WARNING_PERCENT);

    const selection = selectBestLoopCandidate([warned, cleaner], 80, "curvy");

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.repeatedRoadPercent).toBe(16);
    expect(selection.evaluation.candidate.segments[0]?.roadClass).toBe(
      "motorway",
    );
  });

  it("prefers a rural panoramic loop over a highway rectangle when style is scenic (FR-005)", () => {
    const east = offsetCoordinates(GRANBY, 90, 20);
    const northEast = offsetCoordinates(east, 0, 20);
    const north = offsetCoordinates(GRANBY, 0, 20);
    const rectangle = densify({
      type: "LineString",
      coordinates: [
        [GRANBY.longitude, GRANBY.latitude],
        [east.longitude, east.latitude],
        [northEast.longitude, northEast.latitude],
        [north.longitude, north.latitude],
        [GRANBY.longitude, GRANBY.latitude],
      ],
    });

    const highwayLoop: LoopCandidate = {
      ...candidateFromGeometry(rectangle, 80),
      durationMinutes: 50,
      segments: [
        {
          id: "loop-hwy",
          geometry: rectangle,
          distanceKm: 80,
          durationMinutes: 50,
          roadClass: "motorway",
        } satisfies RouteSegment,
      ],
    };
    const scenicLoop: LoopCandidate = {
      ...candidateFromGeometry(rectangle, 80),
      durationMinutes: 95,
      segments: [
        {
          id: "loop-lac",
          geometry: rectangle,
          distanceKm: 80,
          durationMinutes: 95,
          roadClass: "unclassified",
          landscapeFeatures: ["rural", "lake", "village", "panoramic"],
        } satisfies RouteSegment,
      ],
    };

    const selection = selectBestLoopCandidate(
      [
        evaluateLoopCandidate(GRANBY, 80, highwayLoop),
        evaluateLoopCandidate(GRANBY, 80, scenicLoop),
      ],
      80,
      "scenic",
    );

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.candidate.segments[0]?.roadClass).toBe(
      "unclassified",
    );
    expect(selection.evaluation.scenicScore).toBeGreaterThan(
      evaluateLoopCandidate(GRANBY, 80, highwayLoop).scenicScore,
    );
  });

  it("does not let Scenic outrank a large BR-002 repeat gap (FR-005)", () => {
    const warned = stubLoopEvaluation({
      repeatedRoadPercent: 40,
      scenicScore: 90,
      roadClass: "unclassified",
      landscapeFeatures: ["rural", "lake", "village", "panoramic"],
    });
    const cleaner = stubLoopEvaluation({
      repeatedRoadPercent: 16,
      scenicScore: 40,
      roadClass: "motorway",
    });

    expect(warned.repeatedRoadPercent).toBeGreaterThan(
      HIGH_REPEAT_WARNING_PERCENT,
    );
    expect(cleaner.repeatedRoadPercent).toBeLessThan(HIGH_REPEAT_WARNING_PERCENT);

    const selection = selectBestLoopCandidate([warned, cleaner], 80, "scenic");

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.repeatedRoadPercent).toBe(16);
    expect(selection.evaluation.candidate.segments[0]?.roadClass).toBe(
      "motorway",
    );
  });

  it("ranks by Scenic score when both loops stay under the BR-002 warning (FR-005)", () => {
    const highway = stubLoopEvaluation({
      repeatedRoadPercent: 8,
      scenicScore: 40,
      roadClass: "motorway",
    });
    const panoramic = stubLoopEvaluation({
      repeatedRoadPercent: 14,
      scenicScore: 80,
      roadClass: "unclassified",
      landscapeFeatures: ["rural", "lake", "village", "panoramic"],
    });

    const selection = selectBestLoopCandidate([highway, panoramic], 80, "scenic");

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.scenicScore).toBe(80);
    expect(selection.evaluation.candidate.segments[0]?.roadClass).toBe(
      "unclassified",
    );
  });

  it("prefers a paved secondary loop over a highway rectangle when style is touring (FR-006)", () => {
    const east = offsetCoordinates(GRANBY, 90, 20);
    const northEast = offsetCoordinates(east, 0, 20);
    const north = offsetCoordinates(GRANBY, 0, 20);
    const rectangle = densify({
      type: "LineString",
      coordinates: [
        [GRANBY.longitude, GRANBY.latitude],
        [east.longitude, east.latitude],
        [northEast.longitude, northEast.latitude],
        [north.longitude, north.latitude],
        [GRANBY.longitude, GRANBY.latitude],
      ],
    });

    const highwayLoop: LoopCandidate = {
      ...candidateFromGeometry(rectangle, 80),
      durationMinutes: 50,
      segments: [
        {
          id: "loop-hwy",
          geometry: rectangle,
          distanceKm: 80,
          durationMinutes: 50,
          roadClass: "motorway",
          surface: "paved",
        } satisfies RouteSegment,
      ],
    };
    const touringLoop: LoopCandidate = {
      ...candidateFromGeometry(rectangle, 80),
      durationMinutes: 70,
      segments: [
        {
          id: "loop-traverse",
          geometry: rectangle,
          distanceKm: 80,
          durationMinutes: 70,
          roadClass: "secondary",
          surface: "paved",
        } satisfies RouteSegment,
      ],
    };

    const selection = selectBestLoopCandidate(
      [
        evaluateLoopCandidate(GRANBY, 80, highwayLoop),
        evaluateLoopCandidate(GRANBY, 80, touringLoop),
      ],
      80,
      "touring",
    );

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.candidate.segments[0]?.roadClass).toBe(
      "secondary",
    );
    expect(selection.evaluation.touringScore).toBeGreaterThan(
      evaluateLoopCandidate(GRANBY, 80, highwayLoop).touringScore,
    );
  });

  it("does not let Touring outrank a large BR-002 repeat gap (FR-006)", () => {
    const warned = stubLoopEvaluation({
      repeatedRoadPercent: 40,
      touringScore: 90,
      roadClass: "secondary",
      surface: "paved",
    });
    const cleaner = stubLoopEvaluation({
      repeatedRoadPercent: 16,
      touringScore: 40,
      roadClass: "motorway",
      surface: "paved",
    });

    expect(warned.repeatedRoadPercent).toBeGreaterThan(
      HIGH_REPEAT_WARNING_PERCENT,
    );
    expect(cleaner.repeatedRoadPercent).toBeLessThan(HIGH_REPEAT_WARNING_PERCENT);

    const selection = selectBestLoopCandidate([warned, cleaner], 80, "touring");

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.repeatedRoadPercent).toBe(16);
    expect(selection.evaluation.candidate.segments[0]?.roadClass).toBe(
      "motorway",
    );
  });

  it("ranks by Touring score when both loops stay under the BR-002 warning (FR-006)", () => {
    const highway = stubLoopEvaluation({
      repeatedRoadPercent: 8,
      touringScore: 40,
      roadClass: "motorway",
      surface: "paved",
    });
    const traverse = stubLoopEvaluation({
      repeatedRoadPercent: 14,
      touringScore: 80,
      roadClass: "secondary",
      surface: "paved",
    });

    const selection = selectBestLoopCandidate([highway, traverse], 80, "touring");

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.touringScore).toBe(80);
    expect(selection.evaluation.candidate.segments[0]?.roadClass).toBe(
      "secondary",
    );
  });

  it("ranks by Curvy score when both loops stay under the BR-002 warning (FR-004)", () => {
    const highway = stubLoopEvaluation({
      repeatedRoadPercent: 8,
      curvyScore: 40,
      roadClass: "motorway",
    });
    const winding = stubLoopEvaluation({
      repeatedRoadPercent: 14,
      curvyScore: 80,
      roadClass: "secondary",
    });

    const selection = selectBestLoopCandidate([highway, winding], 80, "curvy");

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.curvyScore).toBe(80);
    expect(selection.evaluation.candidate.segments[0]?.roadClass).toBe(
      "secondary",
    );
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

describe("selectBestLoopCandidate (FR-007)", () => {
  it("prefers a reasonable non-highway loop over a Touring-winning highway", () => {
    const highway = stubLoopEvaluation({
      repeatedRoadPercent: 10,
      touringScore: 90,
      roadClass: "motorway",
      surface: "paved",
    });
    const primary = stubLoopEvaluation({
      repeatedRoadPercent: 10,
      touringScore: 40,
      roadClass: "primary",
    });

    const withoutPreference = selectBestLoopCandidate(
      [highway, primary],
      80,
      "touring",
    );
    expect(withoutPreference.status).toBe("selected");
    if (withoutPreference.status === "selected") {
      expect(withoutPreference.evaluation.candidate.segments[0]?.roadClass).toBe(
        "motorway",
      );
      expect(withoutPreference.evaluation.warnings).not.toContain(
        HIGHWAY_AVOIDANCE_WARNING,
      );
    }

    const withPreference = selectBestLoopCandidate(
      [highway, primary],
      80,
      "touring",
      true,
    );
    expect(withPreference.status).toBe("selected");
    if (withPreference.status !== "selected") {
      return;
    }
    expect(withPreference.evaluation.candidate.segments[0]?.roadClass).toBe(
      "primary",
    );
    expect(withPreference.evaluation.warnings).not.toContain(
      HIGHWAY_AVOIDANCE_WARNING,
    );
  });

  it("keeps a highway and signals when no in-tolerance alternative exists", () => {
    const highway = stubLoopEvaluation({
      repeatedRoadPercent: 10,
      touringScore: 90,
      roadClass: "motorway",
      surface: "paved",
    });
    const tooLong: EvaluatedLoopCandidate = {
      ...stubLoopEvaluation({
        repeatedRoadPercent: 10,
        touringScore: 40,
        roadClass: "primary",
      }),
      withinDistanceTolerance: false,
      candidate: {
        ...stubLoopEvaluation({
          repeatedRoadPercent: 10,
          touringScore: 40,
          roadClass: "primary",
        }).candidate,
        distanceKm: 200,
      },
    };

    const selection = selectBestLoopCandidate(
      [highway, tooLong],
      80,
      "touring",
      true,
    );

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.candidate.segments[0]?.roadClass).toBe(
      "motorway",
    );
    expect(selection.evaluation.warnings).toContain(HIGHWAY_AVOIDANCE_WARNING);
  });
});

describe("selectBestLoopCandidate (FR-008)", () => {
  it("excludes a known unpaved loop when avoidance is on (BR-007)", () => {
    const unpaved = stubLoopEvaluation({
      repeatedRoadPercent: 10,
      touringScore: 90,
      roadClass: "secondary",
      surface: "unpaved",
    });
    const paved = stubLoopEvaluation({
      repeatedRoadPercent: 10,
      touringScore: 40,
      roadClass: "secondary",
      surface: "paved",
    });

    const withoutPreference = selectBestLoopCandidate(
      [unpaved, paved],
      80,
      "touring",
    );
    expect(withoutPreference.status).toBe("selected");
    if (withoutPreference.status === "selected") {
      expect(withoutPreference.evaluation.candidate.segments[0]?.surface).toBe(
        "unpaved",
      );
    }

    const withPreference = selectBestLoopCandidate(
      [unpaved, paved],
      80,
      "touring",
      false,
      true,
    );
    expect(withPreference.status).toBe("selected");
    if (withPreference.status !== "selected") {
      return;
    }
    expect(withPreference.evaluation.candidate.segments[0]?.surface).toBe(
      "paved",
    );
  });

  it("rejects rather than silently keeping known unpaved (BR-007)", () => {
    const unpaved = stubLoopEvaluation({
      repeatedRoadPercent: 10,
      touringScore: 90,
      roadClass: "secondary",
      surface: "unpaved",
    });

    const selection = selectBestLoopCandidate(
      [unpaved],
      80,
      "touring",
      false,
      true,
    );

    expect(selection.status).toBe("known_unpaved_rejected");
  });

  it("selects a Canadian loop when stayInCanada is on (FR-028)", () => {
    const canadian = stubLoopEvaluation({
      repeatedRoadPercent: 12,
      touringScore: 40,
      roadClass: "secondary",
      surface: "paved",
    });
    const crossing = stubLoopEvaluation({
      repeatedRoadPercent: 8,
      touringScore: 90,
      roadClass: "secondary",
      surface: "paved",
    });
    crossing.candidate.geometry = {
      type: "LineString",
      coordinates: [
        [GRANBY.longitude, GRANBY.latitude],
        [-83.0458, 42.3314],
        [GRANBY.longitude, GRANBY.latitude],
      ],
    };

    const selection = selectBestLoopCandidate(
      [crossing, canadian],
      80,
      "touring",
      false,
      false,
      true,
    );

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.candidate.geometry.coordinates).toEqual(
      canadian.candidate.geometry.coordinates,
    );
  });

  it("rejects rather than silently keeping a United States crossing (FR-028, BR-009)", () => {
    const crossing = stubLoopEvaluation({
      repeatedRoadPercent: 10,
      touringScore: 90,
      roadClass: "secondary",
      surface: "paved",
    });
    crossing.candidate.geometry = {
      type: "LineString",
      coordinates: [
        [GRANBY.longitude, GRANBY.latitude],
        [-83.0458, 42.3314],
        [GRANBY.longitude, GRANBY.latitude],
      ],
    };

    const selection = selectBestLoopCandidate(
      [crossing],
      80,
      "touring",
      false,
      false,
      true,
    );

    expect(selection.status).toBe("canada_only_rejected");
  });

  it("keeps an unknown surface, does not call it paved, and signals it", () => {
    const unknown = stubLoopEvaluation({
      repeatedRoadPercent: 10,
      touringScore: 40,
      roadClass: "secondary",
      surface: "unknown",
    });

    const selection = selectBestLoopCandidate(
      [unknown],
      80,
      "touring",
      false,
      true,
    );

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.candidate.segments[0]?.surface).toBe("unknown");
    expect(selection.evaluation.candidate.segments[0]?.surface).not.toBe(
      "paved",
    );
    expect(selection.evaluation.warnings).toContain(UNKNOWN_SURFACE_WARNING);
  });

  it("reports a paved out-of-tolerance candidate instead of a silent unpaved keep", () => {
    const unpavedInTolerance = stubLoopEvaluation({
      repeatedRoadPercent: 10,
      touringScore: 90,
      roadClass: "secondary",
      surface: "unpaved",
    });
    const pavedTooLong: EvaluatedLoopCandidate = {
      ...stubLoopEvaluation({
        repeatedRoadPercent: 10,
        touringScore: 40,
        roadClass: "secondary",
        surface: "paved",
      }),
      withinDistanceTolerance: false,
      candidate: {
        ...stubLoopEvaluation({
          repeatedRoadPercent: 10,
          touringScore: 40,
          roadClass: "secondary",
          surface: "paved",
        }).candidate,
        distanceKm: 200,
      },
    };

    const selection = selectBestLoopCandidate(
      [unpavedInTolerance, pavedTooLong],
      80,
      "touring",
      false,
      true,
    );

    expect(selection.status).toBe("distance_out_of_tolerance");
    if (selection.status !== "distance_out_of_tolerance") {
      return;
    }
    expect(selection.evaluation.candidate.segments[0]?.surface).toBe("paved");
    expect(selection.evaluation.candidate.distanceKm).toBe(200);
  });

  it("keeps a paved highway rather than a known unpaved alternative", () => {
    const highwayPaved = stubLoopEvaluation({
      repeatedRoadPercent: 10,
      touringScore: 90,
      roadClass: "motorway",
      surface: "paved",
    });
    const unpavedPrimary = stubLoopEvaluation({
      repeatedRoadPercent: 10,
      touringScore: 40,
      roadClass: "primary",
      surface: "unpaved",
    });

    const selection = selectBestLoopCandidate(
      [highwayPaved, unpavedPrimary],
      80,
      "touring",
      true,
      true,
    );

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.candidate.segments[0]?.roadClass).toBe(
      "motorway",
    );
    expect(selection.evaluation.candidate.segments[0]?.surface).toBe("paved");
    expect(selection.evaluation.warnings).toContain(HIGHWAY_AVOIDANCE_WARNING);
  });
});
