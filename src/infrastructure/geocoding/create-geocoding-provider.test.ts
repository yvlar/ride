import { describe, expect, it } from "vitest";
import { createGeocodingProvider } from "./create-geocoding-provider";
import { HttpGeocodingProvider } from "./http-geocoding-provider";
import { mockGeocodingProvider } from "./mock-geocoding-provider";

describe("createGeocodingProvider (FR-017, NFR-005)", () => {
  it("defaults to the mock provider for local and test use", () => {
    expect(createGeocodingProvider({})).toBe(mockGeocodingProvider);
  });

  it("creates a Nominatim-compatible adapter only when a base URL is configured", () => {
    const provider = createGeocodingProvider({
      GEOCODING_PROVIDER: "nominatim",
      GEOCODING_API_BASE_URL: "https://geocoding.example.test/nominatim",
    });

    expect(provider).toBeInstanceOf(HttpGeocodingProvider);
  });

  it("refuses Nominatim without a configured URL", () => {
    expect(() =>
      createGeocodingProvider({ GEOCODING_PROVIDER: "nominatim" }),
    ).toThrow(/GEOCODING_API_BASE_URL/);
  });
});
