import { describe, expect, it } from "vitest";
import type { Place } from "@/domain/geo/types";
import {
  parseCarPlayCatalogId,
  savedCatalogId,
  toCarPlayCatalog,
} from "./map-carplay-catalog";

const granby: Place = {
  label: "Granby, QC",
  name: "Granby",
  coordinates: { latitude: 45.4, longitude: -72.73 },
};

describe("toCarPlayCatalog (FR-028, FR-035)", () => {
  it("maps recents and saved rides without inventing geometry", () => {
    const catalog = toCarPlayCatalog({
      recents: [granby],
      saved: [
        {
          id: "loop-1",
          name: "Boucle · Granby, QC",
          savedAtMs: 1,
          request: { type: "loop", start: granby, targetDistanceKm: 80 },
          route: {
            id: "loop-1",
            type: "loop",
            start: granby,
            targetDistanceKm: 80,
            geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
            segments: [],
            distanceKm: 80.4,
            durationMinutes: 70,
            statistics: { repeatedRoadPercent: 0 },
            warnings: [],
          },
        },
      ],
      resumeTitle: "Boucle · Granby, QC",
      resumeSubtitle: "Reprendre",
    });

    expect(catalog.recents[0]).toEqual({
      id: "recent:0",
      title: "Granby",
      subtitle: "Granby, QC",
    });
    expect(catalog.favorites[0]?.id).toBe(savedCatalogId("loop-1"));
    expect(catalog.resumeTitle).toBe("Boucle · Granby, QC");
  });

  it("parses catalog selection ids", () => {
    expect(parseCarPlayCatalogId("resume")).toEqual({ type: "resume" });
    expect(parseCarPlayCatalogId("recent:2")).toEqual({
      type: "recent",
      index: 2,
    });
    expect(parseCarPlayCatalogId("saved:loop-1")).toEqual({
      type: "saved",
      id: "loop-1",
    });
    expect(parseCarPlayCatalogId("unknown")).toBeNull();
  });
});
