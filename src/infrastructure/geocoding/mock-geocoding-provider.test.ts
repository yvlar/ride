import { describe, expect, it } from "vitest";
import { mockGeocodingProvider } from "./mock-geocoding-provider";

describe("MockGeocodingProvider (FR-017)", () => {
  it("returns matching places for a partial query", async () => {
    const places = await mockGeocodingProvider.search("gran", "fr");

    expect(places.map((place) => place.label)).toEqual([
      "Granby, Québec, Canada",
      "Granby, Colorado, États-Unis",
      "125 Rue Principale, Granby, Québec, Canada",
      "J2G 2W4, Granby, Québec, Canada",
    ]);
    expect(places.at(0)).toMatchObject({
      name: "Granby",
      locality: "Granby",
      region: "Québec",
      country: "Canada",
      kind: "city",
      coordinates: { latitude: 45.4001, longitude: -72.7342 },
    });
  });

  it("matches without regard to accents", async () => {
    const places = await mockGeocodingProvider.search("quebec", "fr");

    expect(places.map((place) => place.label)).toContain(
      "Québec, Québec, Canada",
    );
  });

  it("returns no results for a query that is too short", async () => {
    await expect(mockGeocodingProvider.search("g", "fr")).resolves.toEqual([]);
  });

  it("labels a nearby reverse lookup with the closest known place", async () => {
    const coordinates = { latitude: 45.4, longitude: -72.73 };
    const place = await mockGeocodingProvider.reverse(coordinates, "fr");

    // The nearest fixture is the street address, not the municipality
    // centroid: a reverse lookup should return the most precise known place.
    expect(place.label).toBe("125 Rue Principale, Granby, Québec, Canada");
    expect(place.locality).toBe("Granby");
    expect(place.region).toBe("Québec");
    expect(place.kind).toBe("address");
    expect(place.coordinates).toEqual(coordinates);
  });

  it("falls back to the current-position label far from known places", async () => {
    const coordinates = { latitude: 0, longitude: 0 };
    const place = await mockGeocodingProvider.reverse(coordinates, "fr");

    expect(place.label).toBe("Position actuelle");
    expect(place.coordinates).toEqual(coordinates);
  });
});
