import { describe, expect, it, vi } from "vitest";
import { CURRENT_POSITION_FALLBACK_LABEL } from "@/infrastructure/geocoding/labels";
import {
  currentPositionFallback,
  reverseGeocodePlace,
} from "./reverse-geocode-place";

const coordinates = { latitude: 45.4001, longitude: -72.7342 };

describe("reverseGeocodePlace (FR-017)", () => {
  it("returns the readable address from the internal API", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            place: {
              id: "nominatim:123",
              label: "12 Rue Principale, Granby",
              name: "12 Rue Principale",
              addressLine: "12 Rue Principale",
              fullAddress:
                "12 Rue Principale, Granby, Québec, J2G 2W4, Canada",
              locality: "Granby",
              region: "Québec",
              postalCode: "J2G 2W4",
              country: "Canada",
              countryCode: "CA",
              type: "address",
              source: "map",
              precision: "exact",
              bounds: {
                west: -72.74,
                south: 45.39,
                east: -72.72,
                north: 45.41,
              },
              coordinates: { latitude: 0, longitude: 0 },
            },
          },
        }),
        { status: 200 },
      ),
    );

    await expect(
      reverseGeocodePlace(coordinates, "fr", fetcher),
    ).resolves.toEqual({
      id: "nominatim:123",
      label: "12 Rue Principale, Granby",
      name: "12 Rue Principale",
      addressLine: "12 Rue Principale",
      fullAddress: "12 Rue Principale, Granby, Québec, J2G 2W4, Canada",
      locality: "Granby",
      region: "Québec",
      postalCode: "J2G 2W4",
      country: "Canada",
      countryCode: "CA",
      type: "address",
      source: "map",
      precision: "exact",
      bounds: {
        west: -72.74,
        south: 45.39,
        east: -72.72,
        north: 45.41,
      },
      coordinates,
    });
    const requested = String(fetcher.mock.calls.at(0)?.at(0));
    expect(requested).toContain("/api/geocode/reverse");
    expect(requested).not.toMatch(/nominatim|openstreetmap/i);
  });

  it("fails when the internal API errors so the UI can fall back", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 503 }));

    await expect(
      reverseGeocodePlace(coordinates, "fr", fetcher),
    ).rejects.toThrow("Reverse geocoding failed");
  });

  it("builds the current-position fallback without changing coordinates", () => {
    expect(currentPositionFallback(coordinates)).toEqual({
      label: CURRENT_POSITION_FALLBACK_LABEL,
      coordinates,
    });
  });
});
