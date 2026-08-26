import { describe, expect, it } from "vitest";
import { mockGeocodingProvider } from "@/infrastructure/geocoding/mock-geocoding-provider";
import { SupabasePostalCodeProvider } from "@/infrastructure/postal-codes/supabase-postal-code-provider";
import { createPostalCodeTableFetch } from "@/test/postal-code-fixtures";
import { searchDestinationPlaces } from "./search-destination-places";

/**
 * FR-040 — chaîne complète : recherche → adaptateur Supabase (table simulée)
 * → destination, avec repli sur le géocodage existant (FR-032).
 */
function dependencies() {
  return {
    geocoding: mockGeocodingProvider,
    postalCodes: new SupabasePostalCodeProvider(
      "https://project.supabase.co",
      "test-anon-key",
      { fetcher: createPostalCodeTableFetch() },
    ),
  };
}

describe("recherche de destination par code postal (FR-040)", () => {
  it("trouve Granby, Roxton Pond et Sherbrooke", async () => {
    const results = await Promise.all(
      ["J2G 2W4", "J0E 1Z0", "J1H 1A1"].map((query) =>
        searchDestinationPlaces(query, "fr", dependencies()),
      ),
    );

    expect(results.map(([place]) => place?.label)).toEqual([
      "J2G 2W4, Granby, QC",
      "J0E 1Z0, Roxton Pond, QC",
      "J1H 1A1, Sherbrooke, QC",
    ]);
    for (const [place] of results) {
      expect(place?.coordinates.latitude).toEqual(expect.any(Number));
      expect(place?.coordinates.longitude).toEqual(expect.any(Number));
    }
  });

  it("traite « J2G 2W4 » et « J2G2W4 » comme la même recherche", async () => {
    const spaced = await searchDestinationPlaces("J2G 2W4", "fr", dependencies());
    const compact = await searchDestinationPlaces("J2G2W4", "fr", dependencies());
    const lowercase = await searchDestinationPlaces(
      " j2g 2w4 ",
      "fr",
      dependencies(),
    );

    expect(spaced).toEqual(compact);
    expect(lowercase).toEqual(compact);
    expect(compact[0]?.coordinates).toEqual({
      latitude: 45.4008,
      longitude: -72.7331,
    });
  });

  it("retombe sur le géocodage pour une ville, une adresse ou un POI", async () => {
    const city = await searchDestinationPlaces("Sherbrooke", "fr", dependencies());
    const unknownPostalCode = await searchDestinationPlaces(
      "K1A 0B1",
      "fr",
      dependencies(),
    );

    expect(city[0]?.label).toBe("Sherbrooke, QC");
    expect(unknownPostalCode).toEqual([]);
  });
});
