import { describe, expect, it } from "vitest";
import { principalRoadNames, routeShareSummary } from "./route-share";
import type { RouteSegment } from "./types";

function segment(
  overrides: Partial<RouteSegment> & Pick<RouteSegment, "id" | "distanceKm">,
): RouteSegment {
  return {
    geometry: {
      type: "LineString",
      coordinates: [
        [0, 0],
        [0.01, 0.01],
      ],
    },
    durationMinutes: 10,
    ...overrides,
  };
}

describe("routeShareSummary (FR-020)", () => {
  it("returns null shares when the provider sent no tags", () => {
    expect(
      routeShareSummary([
        segment({ id: "a", distanceKm: 10 }),
        segment({ id: "b", distanceKm: 10 }),
      ]),
    ).toEqual({
      highwayPercent: null,
      unpavedPercent: null,
      unknownSurface: true,
    });
  });

  it("reports highway and unpaved percents only from tagged segments", () => {
    expect(
      routeShareSummary([
        segment({
          id: "hwy",
          distanceKm: 10,
          roadClass: "motorway",
          surface: "paved",
          roadName: "A-10",
        }),
        segment({
          id: "dirt",
          distanceKm: 10,
          roadClass: "unclassified",
          surface: "unpaved",
          roadName: "Rang 8",
        }),
      ]),
    ).toEqual({
      highwayPercent: 50,
      unpavedPercent: 50,
      unknownSurface: false,
    });
    expect(
      principalRoadNames([
        segment({ id: "hwy", distanceKm: 10, roadName: "A-10" }),
        segment({ id: "dirt", distanceKm: 10, roadName: "Rang 8" }),
      ]),
    ).toEqual(["A-10", "Rang 8"]);
  });
});
