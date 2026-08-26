import { describe, expect, it } from "vitest";
import { mockGeocodingProvider } from "./mock-geocoding-provider";

describe("MockGeocodingProvider (FR-017)", () => {
  it("returns matching places for a partial query", async () => {
    const places = await mockGeocodingProvider.search("gran", "fr");

    expect(places).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Granby, QC",
          coordinates: { latitude: 45.4001, longitude: -72.7342 },
          type: "city",
          region: "Québec",
          country: "Canada",
        }),
      ]),
    );
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

    expect(place.label).toBe("125 Rue Principale, Granby, Québec");
    expect(place.coordinates).toEqual(coordinates);
    expect(place.source).toBe("map");
  });

  it("falls back to the current-position label far from known places", async () => {
    const coordinates = { latitude: 0, longitude: 0 };
    const place = await mockGeocodingProvider.reverse(coordinates, "fr");

    expect(place.label).toBe("Position actuelle");
    expect(place.coordinates).toEqual(coordinates);
  });

  it("finds a complete address and a normalized postal-code area", async () => {
    await expect(mockGeocodingProvider.search("125 rue", "fr")).resolves.toEqual([
      expect.objectContaining({ type: "address", locality: "Granby" }),
    ]);
    await expect(mockGeocodingProvider.search("j2g 2w4", "fr")).resolves.toEqual([
      expect.objectContaining({
        postalCode: "J2G 2W4",
        type: "postal_code",
        precision: "approximate",
      }),
    ]);
  });
});
