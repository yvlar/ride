import { describe, expect, it } from "vitest";
import type { Place } from "@/domain/geo/types";
import {
  findRecentPlaceByCatalogId,
  parseCarPlayCatalogId,
  recentCatalogId,
  savedCatalogId,
  toCarPlayCatalog,
} from "./map-carplay-catalog";

const granby: Place = {
  label: "Granby, QC",
  name: "Granby",
  coordinates: { latitude: 45.4, longitude: -72.73 },
};

const magog: Place = {
  label: "Magog, QC",
  name: "Magog",
  coordinates: { latitude: 45.27, longitude: -72.15 },
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
      id: recentCatalogId(granby),
      title: "Granby",
      subtitle: "Granby, QC",
    });
    expect(catalog.favorites[0]?.id).toBe(savedCatalogId("loop-1"));
    expect(catalog.resumeTitle).toBe("Boucle · Granby, QC");
  });

  it("keeps recent ids stable when the list is reordered", () => {
    const first = toCarPlayCatalog({ recents: [granby, magog], saved: [] });
    const reordered = toCarPlayCatalog({ recents: [magog, granby], saved: [] });
    const granbyId = recentCatalogId(granby);

    expect(first.recents[0]?.id).toBe(granbyId);
    expect(reordered.recents[1]?.id).toBe(granbyId);
    expect(findRecentPlaceByCatalogId([magog, granby], granbyId)).toEqual(granby);
  });

  it("parses catalog selection ids", () => {
    expect(parseCarPlayCatalogId("resume")).toEqual({ type: "resume" });
    expect(parseCarPlayCatalogId(recentCatalogId(granby))).toEqual({
      type: "recent",
      key: recentCatalogId(granby).slice("recent:".length),
    });
    expect(parseCarPlayCatalogId("recent:2")).toBeNull();
    expect(parseCarPlayCatalogId("saved:loop-1")).toEqual({
      type: "saved",
      id: "loop-1",
    });
    expect(parseCarPlayCatalogId("unknown")).toBeNull();
  });
});
