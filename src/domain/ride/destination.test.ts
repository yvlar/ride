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
import { HIGHWAY_AVOIDANCE_WARNING } from "./highways";
import { UNKNOWN_SURFACE_WARNING } from "./surfaces";
import type { DestinationCandidate, RouteSegment } from "./types";

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

function twoVertexPath(destination: Coordinates): DestinationCandidate {
  return {
    geometry: {
      type: "LineString",
      coordinates: [
        [GRANBY.longitude, GRANBY.latitude],
        [destination.longitude, destination.latitude],
      ],
    },
    segments: [],
    distanceKm: haversineKm(GRANBY, destination),
    durationMinutes: 5,
    waypoints: [],
  };
}

function loopBackToStart(): DestinationCandidate {
  const east = offsetCoordinates(GRANBY, 90, 0.4);
  return {
    geometry: {
      type: "LineString",
      coordinates: [
        [GRANBY.longitude, GRANBY.latitude],
        [east.longitude, east.latitude],
        [GRANBY.longitude, GRANBY.latitude],
      ],
    },
    segments: [],
    distanceKm: 0.8,
    durationMinutes: 2,
    waypoints: [],
  };
}

function threeVertexPath(): DestinationCandidate {
  const mid = offsetCoordinates(GRANBY, 90, 2);
  return {
    geometry: {
      type: "LineString",
      coordinates: [
        [GRANBY.longitude, GRANBY.latitude],
        [mid.longitude, mid.latitude],
        [TREMBLANT.longitude, TREMBLANT.latitude],
      ],
    },
    segments: [],
    distanceKm: 170,
    durationMinutes: 130,
    waypoints: [],
  };
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

  it("drops destination seeds that land in the United States (FR-028)", () => {
    const niagaraOnTheLake = {
      latitude: 43.2554,
      longitude: -79.0712,
    };
    const buffalo = { latitude: 42.8864, longitude: -78.8784 };
    const unrestricted = createDestinationWaypointSets(niagaraOnTheLake, buffalo);
    const canadian = createDestinationWaypointSets(
      niagaraOnTheLake,
      buffalo,
      undefined,
      true,
    );

    expect(canadian.some((set) => set.waypoints.length === 0)).toBe(true);
    expect(canadian.length).toBeLessThan(unrestricted.length);
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

  it("accepts a single road segment with only two vertices", () => {
    const nearby = offsetCoordinates(GRANBY, 90, 1.5);
    const evaluation = evaluateDestinationCandidate(
      GRANBY,
      nearby,
      twoVertexPath(nearby),
      { shortestDistanceKm: 1.5 },
    );

    expect(evaluation.followsRoadNetwork).toBe(true);
    expect(evaluation.startsAtStart).toBe(true);
    expect(evaluation.reachesDestination).toBe(true);
  });

  it("does not treat a return to the start as reaching a nearby destination", () => {
    const nearby = offsetCoordinates(GRANBY, 90, 1.5);
    const evaluation = evaluateDestinationCandidate(
      GRANBY,
      nearby,
      loopBackToStart(),
      { shortestDistanceKm: 0.8 },
    );

    expect(evaluation.startsAtStart).toBe(true);
    expect(evaluation.reachesDestination).toBe(false);
  });

  it("accepts a short road path with only one intermediate vertex", () => {
    const evaluation = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      threeVertexPath(),
      { shortestDistanceKm: 170 },
    );

    expect(evaluation.followsRoadNetwork).toBe(true);
    expect(evaluation.startsAtStart).toBe(true);
    expect(evaluation.reachesDestination).toBe(true);
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

function highwayCandidate(): DestinationCandidate {
  return {
    ...fastestCandidate(),
    durationMinutes: 90,
    segments: [
      {
        id: "hwy",
        geometry: fastestCandidate().geometry,
        distanceKm: 180,
        durationMinutes: 90,
        roadClass: "motorway",
        elevationGainM: 0,
      } satisfies RouteSegment,
    ],
  };
}

function scenicRuralCandidate(): DestinationCandidate {
  return {
    ...fastestCandidate(),
    distanceKm: 200,
    durationMinutes: 190,
    segments: [
      {
        id: "lac",
        geometry: fastestCandidate().geometry,
        distanceKm: 200,
        durationMinutes: 190,
        roadClass: "unclassified",
        landscapeFeatures: ["rural", "lake", "village", "panoramic"],
      } satisfies RouteSegment,
    ],
  };
}

function touringSecondaryCandidate(): DestinationCandidate {
  const points: Coordinates[] = [GRANBY];
  let cursor = GRANBY;
  let bearing = 315;
  for (let index = 0; index < 4; index += 1) {
    cursor = offsetCoordinates(cursor, bearing, 30);
    points.push(cursor);
    bearing = (bearing + 25) % 360;
  }
  points.push(TREMBLANT);
  return {
    ...candidateFromPoints(points, 205, 175),
    segments: [
      {
        id: "traverse",
        geometry: candidateFromPoints(points, 205, 175).geometry,
        distanceKm: 205,
        durationMinutes: 175,
        roadClass: "secondary",
        surface: "paved",
      } satisfies RouteSegment,
    ],
  };
}

function windingSecondaryCandidate(): DestinationCandidate {
  return {
    ...curvyCandidate(),
    durationMinutes: 200,
    segments: [
      {
        id: "ridge",
        geometry: curvyCandidate().geometry,
        distanceKm: 210,
        durationMinutes: 200,
        roadClass: "secondary",
        elevationGainM: 900,
      } satisfies RouteSegment,
    ],
  };
}

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
    expect(styleRankScore("curvy", twistier)).toBeGreaterThan(
      styleRankScore("curvy", shortest),
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

  it("selects the shortest travel time when style is fastest", () => {
    const selection = selectBestDestinationCandidate(
      [twistier, shortest],
      "fastest",
    );

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.candidate.durationMinutes).toBe(120);
    expect(selection.evaluation.candidate.distanceKm).toBe(180);
  });

  it("prefers a winding secondary climb over a faster highway (FR-004)", () => {
    const highway = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      highwayCandidate(),
      { shortestDistanceKm: 180 },
    );
    const winding = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      windingSecondaryCandidate(),
      { shortestDistanceKm: 180 },
    );

    expect(styleRankScore("curvy", winding)).toBeGreaterThan(
      styleRankScore("curvy", highway),
    );

    const selection = selectBestDestinationCandidate(
      [highway, winding],
      "curvy",
    );

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.candidate.durationMinutes).toBe(200);
    expect(selection.evaluation.candidate.segments[0]?.roadClass).toBe(
      "secondary",
    );
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

  it("does not return a 3x detour when a shorter anchored route exists", () => {
    const triple = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      { ...curvyCandidate(), distanceKm: 540, durationMinutes: 400 },
      { shortestDistanceKm: 180 },
    );

    const selection = selectBestDestinationCandidate(
      [shortest, triple],
      "curvy",
    );

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.candidate.distanceKm).toBe(180);
  });

  it("prefers a rural panoramic corridor over a faster highway (FR-005)", () => {
    const highway = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      highwayCandidate(),
      { shortestDistanceKm: 180 },
    );
    const scenic = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      scenicRuralCandidate(),
      { shortestDistanceKm: 180 },
    );

    expect(styleRankScore("scenic", scenic)).toBeGreaterThan(
      styleRankScore("scenic", highway),
    );

    const selection = selectBestDestinationCandidate(
      [highway, scenic],
      "scenic",
    );

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.candidate.durationMinutes).toBe(190);
    expect(selection.evaluation.candidate.segments[0]?.roadClass).toBe(
      "unclassified",
    );
  });

  it("does not let scenic maximize length up to the detour cap (FR-002)", () => {
    const nearCap = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      { ...curvyCandidate(), distanceKm: 315, durationMinutes: 250 },
      { shortestDistanceKm: 180 },
    );

    const selection = selectBestDestinationCandidate(
      [shortest, twistier, nearCap],
      "scenic",
    );

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.candidate.distanceKm).toBeLessThan(315);
    expect(selection.evaluation.candidate.distanceKm).not.toBe(315);
  });

  it("prefers a paved secondary touring corridor over a faster highway (FR-006)", () => {
    const highway = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      highwayCandidate(),
      { shortestDistanceKm: 180 },
    );
    const touring = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      touringSecondaryCandidate(),
      { shortestDistanceKm: 180 },
    );

    expect(styleRankScore("touring", touring)).toBeGreaterThan(
      styleRankScore("touring", highway),
    );

    const selection = selectBestDestinationCandidate(
      [highway, touring],
      "touring",
    );

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.candidate.durationMinutes).toBe(175);
    expect(selection.evaluation.candidate.segments[0]?.roadClass).toBe(
      "secondary",
    );
    expect(selection.evaluation.candidate.segments[0]?.surface).toBe("paved");
  });

  it("does not rank touring candidates by duration (BR-003)", () => {
    const slower = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      { ...fastestCandidate(), durationMinutes: 300 },
      { shortestDistanceKm: 180 },
    );
    const faster = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      { ...fastestCandidate(), durationMinutes: 90 },
      { shortestDistanceKm: 180 },
    );

    expect(styleRankScore("touring", slower)).toBe(
      styleRankScore("touring", faster),
    );
    expect(styleRankScore("scenic", slower)).toBe(
      styleRankScore("scenic", faster),
    );
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

function pavedHighwayCandidate(): DestinationCandidate {
  return {
    ...fastestCandidate(),
    durationMinutes: 90,
    segments: [
      {
        id: "paved-hwy",
        geometry: fastestCandidate().geometry,
        distanceKm: 180,
        durationMinutes: 90,
        roadClass: "motorway",
        surface: "paved",
      } satisfies RouteSegment,
    ],
  };
}

function primaryAlongHighwayGeometry(distanceKm = 180): DestinationCandidate {
  return {
    ...fastestCandidate(),
    distanceKm,
    durationMinutes: 95,
    segments: [
      {
        id: "primary",
        geometry: fastestCandidate().geometry,
        distanceKm,
        durationMinutes: 95,
        roadClass: "primary",
      } satisfies RouteSegment,
    ],
  };
}

describe("selectBestDestinationCandidate (FR-007)", () => {
  it("prefers a reasonable non-highway alternative over a Touring-winning highway", () => {
    const highway = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      pavedHighwayCandidate(),
      { shortestDistanceKm: 180 },
    );
    const primary = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      primaryAlongHighwayGeometry(),
      { shortestDistanceKm: 180 },
    );

    expect(styleRankScore("touring", highway)).toBeGreaterThan(
      styleRankScore("touring", primary),
    );

    const withoutPreference = selectBestDestinationCandidate(
      [highway, primary],
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

    const withPreference = selectBestDestinationCandidate(
      [highway, primary],
      "touring",
      undefined,
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

  it("keeps a highway and signals when the alternative is a disproportionate detour", () => {
    const highway = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      pavedHighwayCandidate(),
      { shortestDistanceKm: 180 },
    );
    const detour = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      primaryAlongHighwayGeometry(540),
      { shortestDistanceKm: 180 },
    );

    expect(detour.disproportionateDetour).toBe(true);

    const selection = selectBestDestinationCandidate(
      [highway, detour],
      "touring",
      undefined,
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

describe("selectBestDestinationCandidate (FR-008)", () => {
  it("excludes a known unpaved corridor when avoidance is on (BR-007)", () => {
    const unpaved = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      {
        ...fastestCandidate(),
        durationMinutes: 90,
        segments: [
          {
            id: "unpaved",
            geometry: fastestCandidate().geometry,
            distanceKm: 180,
            durationMinutes: 90,
            roadClass: "secondary",
            surface: "unpaved",
          } satisfies RouteSegment,
        ],
      },
      { shortestDistanceKm: 180 },
    );
    const paved = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      {
        ...primaryAlongHighwayGeometry(),
        segments: [
          {
            id: "paved",
            geometry: fastestCandidate().geometry,
            distanceKm: 180,
            durationMinutes: 95,
            roadClass: "primary",
            surface: "paved",
          } satisfies RouteSegment,
        ],
      },
      { shortestDistanceKm: 180 },
    );

    const withoutPreference = selectBestDestinationCandidate(
      [unpaved, paved],
      "touring",
    );
    expect(withoutPreference.status).toBe("selected");
    if (withoutPreference.status === "selected") {
      expect(withoutPreference.evaluation.candidate.segments[0]?.surface).toBe(
        "unpaved",
      );
    }

    const withPreference = selectBestDestinationCandidate(
      [unpaved, paved],
      "touring",
      undefined,
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
    const unpaved = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      {
        ...fastestCandidate(),
        segments: [
          {
            id: "unpaved",
            geometry: fastestCandidate().geometry,
            distanceKm: 180,
            durationMinutes: 90,
            roadClass: "secondary",
            surface: "unpaved",
          } satisfies RouteSegment,
        ],
      },
      { shortestDistanceKm: 180 },
    );

    const selection = selectBestDestinationCandidate(
      [unpaved],
      "touring",
      undefined,
      false,
      true,
    );

    expect(selection.status).toBe("known_unpaved_rejected");
  });

  it("keeps a paved detour rather than silently proposing known unpaved", () => {
    const unpaved = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      {
        ...fastestCandidate(),
        segments: [
          {
            id: "unpaved",
            geometry: fastestCandidate().geometry,
            distanceKm: 180,
            durationMinutes: 90,
            roadClass: "secondary",
            surface: "unpaved",
          } satisfies RouteSegment,
        ],
      },
      { shortestDistanceKm: 180 },
    );
    const pavedDetour = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      {
        ...primaryAlongHighwayGeometry(540),
        segments: [
          {
            id: "paved-detour",
            geometry: fastestCandidate().geometry,
            distanceKm: 540,
            durationMinutes: 240,
            roadClass: "primary",
            surface: "paved",
          } satisfies RouteSegment,
        ],
      },
      { shortestDistanceKm: 180 },
    );

    expect(unpaved.disproportionateDetour).toBe(false);
    expect(pavedDetour.disproportionateDetour).toBe(true);

    const selection = selectBestDestinationCandidate(
      [unpaved, pavedDetour],
      "touring",
      undefined,
      false,
      true,
    );

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.candidate.segments[0]?.surface).toBe("paved");
  });

  it("keeps an unknown surface, does not call it paved, and signals it", () => {
    const unknown = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      {
        ...fastestCandidate(),
        segments: [
          {
            id: "unknown",
            geometry: fastestCandidate().geometry,
            distanceKm: 180,
            durationMinutes: 120,
            roadClass: "primary",
            surface: "unknown",
          } satisfies RouteSegment,
        ],
      },
      { shortestDistanceKm: 180 },
    );

    const selection = selectBestDestinationCandidate(
      [unknown],
      "touring",
      undefined,
      false,
      true,
    );

    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") {
      return;
    }
    expect(selection.evaluation.candidate.segments[0]?.surface).toBe("unknown");
    expect(selection.evaluation.warnings).toContain(UNKNOWN_SURFACE_WARNING);
  });

  it("selects a Canadian corridor when stayInCanada is on (FR-028)", () => {
    const canadian = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      fastestCandidate(),
      { shortestDistanceKm: 180 },
    );
    const crossing = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      {
        ...fastestCandidate(),
        geometry: densify({
          type: "LineString",
          coordinates: [
            [GRANBY.longitude, GRANBY.latitude],
            [-83.0458, 42.3314],
            [TREMBLANT.longitude, TREMBLANT.latitude],
          ],
        }),
      },
      { shortestDistanceKm: 180 },
    );

    const selection = selectBestDestinationCandidate(
      [crossing, canadian],
      "touring",
      undefined,
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
    const crossing = evaluateDestinationCandidate(
      GRANBY,
      TREMBLANT,
      {
        ...fastestCandidate(),
        geometry: densify({
          type: "LineString",
          coordinates: [
            [GRANBY.longitude, GRANBY.latitude],
            [-83.0458, 42.3314],
            [TREMBLANT.longitude, TREMBLANT.latitude],
          ],
        }),
      },
      { shortestDistanceKm: 180 },
    );

    const selection = selectBestDestinationCandidate(
      [crossing],
      "touring",
      undefined,
      false,
      false,
      true,
    );

    expect(selection.status).toBe("canada_only_rejected");
  });
});
