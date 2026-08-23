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
              label: "12 Rue Principale, Granby",
              coordinates,
            },
          },
        }),
        { status: 200 },
      ),
    );

    await expect(
      reverseGeocodePlace(coordinates, "fr", fetcher),
    ).resolves.toEqual({
      label: "12 Rue Principale, Granby",
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
