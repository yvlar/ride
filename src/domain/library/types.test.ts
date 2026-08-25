import { describe, expect, it } from "vitest";
import type { Place } from "@/domain/geo/types";
import { rememberRecentPlace, savedRideName, upsertSavedRide } from "./types";

const granby: Place = {
  label: "Granby, QC",
  coordinates: { latitude: 45.4, longitude: -72.73 },
};

describe("ride library helpers (FR-035)", () => {
  it("keeps the latest recent first and drops duplicates", () => {
    const magog = {
      label: "Magog, QC",
      coordinates: { latitude: 45.27, longitude: -72.15 },
    };
    const next = rememberRecentPlace([granby, magog], granby, 8);
    expect(next[0]).toEqual(granby);
    expect(next).toHaveLength(2);
  });

  it("names a destination ride for the saved list", () => {
    expect(
      savedRideName({
        id: "r1",
        type: "destination",
        start: granby,
        destination: {
          label: "Mont-Tremblant, QC",
          coordinates: { latitude: 46.12, longitude: -74.6 },
        },
        style: "scenic",
        geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
        segments: [],
        distanceKm: 140,
        durationMinutes: 110,
        warnings: [],
      }),
    ).toBe("Granby, QC → Mont-Tremblant, QC");
  });

  it("uses the GPX name for a saved imported trace (FR-039)", () => {
    expect(
      savedRideName({
        id: "g1",
        type: "gpx",
        source: "gpx",
        name: "Cantons",
        start: granby,
        destination: granby,
        style: "touring",
        geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
        parts: [{ type: "LineString", coordinates: [[0, 0], [1, 1]] }],
        gapBeforeVertex: [],
        segments: [],
        distanceKm: 12,
        durationMinutes: 20,
        warnings: [],
        isClosedLoop: false,
        trackKind: "track",
        originalGeometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
        originalParts: [{ type: "LineString", coordinates: [[0, 0], [1, 1]] }],
      }),
    ).toBe("Cantons");
  });

  it("caps saved rides while replacing the same id", () => {
    const rides = upsertSavedRide(
      [
        {
          id: "a",
          name: "A",
          savedAtMs: 1,
          request: {
            type: "loop",
            start: granby,
            targetDistanceKm: 80,
          },
          route: {
            id: "a",
            type: "loop",
            start: granby,
            targetDistanceKm: 80,
            geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
            segments: [],
            distanceKm: 80,
            durationMinutes: 70,
            statistics: { repeatedRoadPercent: 0 },
            warnings: [],
          },
        },
      ],
      {
        id: "a",
        name: "A2",
        savedAtMs: 2,
        request: {
          type: "loop",
          start: granby,
          targetDistanceKm: 90,
        },
        route: {
          id: "a",
          type: "loop",
          start: granby,
          targetDistanceKm: 90,
          geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
          segments: [],
          distanceKm: 90,
          durationMinutes: 80,
          statistics: { repeatedRoadPercent: 0 },
          warnings: [],
        },
      },
    );
    expect(rides).toHaveLength(1);
    expect(rides[0]?.name).toBe("A2");
  });
});
