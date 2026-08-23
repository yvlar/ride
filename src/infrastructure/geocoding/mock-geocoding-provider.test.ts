import { describe, expect, it } from "vitest";
import { mockGeocodingProvider } from "./mock-geocoding-provider";

describe("MockGeocodingProvider (FR-017)", () => {
  it("returns matching places for a partial query", async () => {
    const places = await mockGeocodingProvider.search("gran", "fr");

    expect(places).toEqual([
      {
        label: "Granby, QC",
        coordinates: { latitude: 45.4001, longitude: -72.7342 },
      },
    ]);
  });

  it("matches without regard to accents", async () => {
    const places = await mockGeocodingProvider.search("quebec", "fr");

    expect(places.map((place) => place.label)).toContain("Québec, QC");
  });

  it("returns no results for a query that is too short", async () => {
    await expect(mockGeocodingProvider.search("g", "fr")).resolves.toEqual([]);
  });

  it("labels a nearby reverse lookup with the closest known place", async () => {
    const coordinates = { latitude: 45.4, longitude: -72.73 };
    const place = await mockGeocodingProvider.reverse(coordinates, "fr");

    expect(place.label).toBe("Granby, QC");
    expect(place.coordinates).toEqual(coordinates);
  });

  it("falls back to the current-position label far from known places", async () => {
    const coordinates = { latitude: 0, longitude: 0 };
    const place = await mockGeocodingProvider.reverse(coordinates, "fr");

    expect(place.label).toBe("Position actuelle");
    expect(place.coordinates).toEqual(coordinates);
  });
});
