import { describe, expect, it } from "vitest";
import { createGeocodingProvider } from "./create-geocoding-provider";
import { HttpGeocodingProvider } from "./http-geocoding-provider";
import { mockGeocodingProvider } from "./mock-geocoding-provider";
import { PhotonGeocodingProvider } from "./photon-geocoding-provider";

describe("createGeocodingProvider (FR-017, NFR-005)", () => {
  it("defaults to the keyless Photon adapter so search works unconfigured", () => {
    expect(createGeocodingProvider({})).toBeInstanceOf(PhotonGeocodingProvider);
  });

  it("points Photon at a self-hosted instance when one is configured", () => {
    const provider = createGeocodingProvider({
      GEOCODING_PROVIDER: "photon",
      GEOCODING_API_BASE_URL: "https://photon.example.test",
    });

    expect(provider).toBeInstanceOf(PhotonGeocodingProvider);
  });

  it("keeps the mock provider available for offline work and tests", () => {
    expect(createGeocodingProvider({ GEOCODING_PROVIDER: "mock" })).toBe(
      mockGeocodingProvider,
    );
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
