import { describe, expect, it } from "vitest";
import {
  HIGHWAY_AVOIDANCE_WARNING,
  isHighwayRoadClass,
  preferAvoidingHighways,
  usesHighway,
  withHighwayAvoidanceSignal,
} from "./highways";
import type { RouteSegment } from "./types";

function segment(partial: Partial<RouteSegment> & Pick<RouteSegment, "id">): RouteSegment {
  return {
    geometry: { type: "LineString", coordinates: [[0, 0], [1, 0]] },
    distanceKm: 10,
    durationMinutes: 8,
    ...partial,
  };
}

describe("isHighwayRoadClass (FR-007)", () => {
  it("treats motorway and trunk classes as highways", () => {
    expect(isHighwayRoadClass("motorway")).toBe(true);
    expect(isHighwayRoadClass("Motorway_Link")).toBe(true);
    expect(isHighwayRoadClass("trunk")).toBe(true);
    expect(isHighwayRoadClass("trunk_link")).toBe(true);
  });

  it("does not treat secondary, unknown, or missing classes as highways", () => {
    expect(isHighwayRoadClass("secondary")).toBe(false);
    expect(isHighwayRoadClass("unclassified")).toBe(false);
    expect(isHighwayRoadClass("unknown")).toBe(false);
    expect(isHighwayRoadClass(undefined)).toBe(false);
    expect(isHighwayRoadClass("")).toBe(false);
  });
});

describe("usesHighway (FR-007)", () => {
  it("detects a known highway segment", () => {
    expect(
      usesHighway([
        segment({ id: "sec", roadClass: "secondary" }),
        segment({ id: "hwy", roadClass: "motorway" }),
      ]),
    ).toBe(true);
  });

  it("ignores missing and unknown road classes", () => {
    expect(
      usesHighway([
        segment({ id: "sec", roadClass: "secondary" }),
        segment({ id: "bare" }),
      ]),
    ).toBe(false);
  });
});

describe("preferAvoidingHighways (FR-007)", () => {
  const highway = { id: "hwy", highway: true };
  const secondary = { id: "sec", highway: false };

  it("keeps the highway-free candidate when one is already reasonable", () => {
    expect(
      preferAvoidingHighways(
        [highway, secondary],
        (candidate) => candidate.highway,
        true,
      ),
    ).toEqual([secondary]);
  });

  it("keeps the highway candidate when no reasonable alternative exists", () => {
    expect(
      preferAvoidingHighways([highway], (candidate) => candidate.highway, true),
    ).toEqual([highway]);
  });

  it("does not filter when the preference is off", () => {
    expect(
      preferAvoidingHighways(
        [highway, secondary],
        (candidate) => candidate.highway,
        false,
      ),
    ).toEqual([highway, secondary]);
  });
});

describe("withHighwayAvoidanceSignal (FR-007)", () => {
  const highwayEvaluation = {
    candidate: {
      segments: [segment({ id: "hwy", roadClass: "motorway" })],
    },
    warnings: [] as string[],
  };

  it("signals when a highway is kept because no reasonable alternative exists", () => {
    expect(withHighwayAvoidanceSignal(highwayEvaluation, true).warnings).toEqual([
      HIGHWAY_AVOIDANCE_WARNING,
    ]);
  });

  it("does not warn when the preference is off or the route has no highway", () => {
    expect(withHighwayAvoidanceSignal(highwayEvaluation, false).warnings).toEqual(
      [],
    );
    expect(
      withHighwayAvoidanceSignal(
        {
          candidate: {
            segments: [segment({ id: "sec", roadClass: "secondary" })],
          },
          warnings: [],
        },
        true,
      ).warnings,
    ).toEqual([]);
  });
});
