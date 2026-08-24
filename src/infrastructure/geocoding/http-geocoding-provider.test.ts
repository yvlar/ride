import { describe, expect, it, vi } from "vitest";
import { HttpGeocodingProvider } from "./http-geocoding-provider";

const GRANBY = { latitude: 45.4001, longitude: -72.7342 };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("HttpGeocodingProvider (FR-017)", () => {
  it("reverses coordinates into a readable label and keeps the exact GPS point", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        display_name: "12 Rue Principale, Granby, Québec, Canada",
        lat: "45.401",
        lon: "-72.735",
        address: {
          house_number: "12",
          road: "Rue Principale",
          city: "Granby",
          state: "Québec",
        },
      }),
    );
    const provider = new HttpGeocodingProvider(
      "https://geocoding.example.test/nominatim",
      fetcher,
    );

    await expect(provider.reverse(GRANBY, "fr")).resolves.toEqual({
      label: "12 Rue Principale, Granby, Québec",
      coordinates: GRANBY,
      name: "12 Rue Principale",
      locality: "Granby",
      region: "Québec",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const requested = new URL(String(fetcher.mock.calls.at(0)?.at(0)));
    expect(requested.pathname.endsWith("/reverse")).toBe(true);
    expect(requested.searchParams.get("lat")).toBe("45.4001");
    expect(requested.searchParams.get("lon")).toBe("-72.7342");
    expect(requested.searchParams.get("accept-language")).toBe("fr");
  });

  it("rejects an invalid external reverse response (FR-017)", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ unexpected: true }));
    const provider = new HttpGeocodingProvider(
      "https://geocoding.example.test/nominatim",
      fetcher,
    );

    await expect(provider.reverse(GRANBY, "fr")).rejects.toThrow(
      "Réponse de géocodage invalide.",
    );
  });

  it("does not log coordinates when a reverse response is invalid", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const fetcher = vi.fn(async () => jsonResponse({ error: true }));
    const provider = new HttpGeocodingProvider(
      "https://geocoding.example.test/nominatim",
      fetcher,
    );

    await expect(provider.reverse(GRANBY, "fr")).rejects.toThrow();
    expect(error.mock.calls.flat().join(" ")).not.toContain("45.4001");
    expect(log).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    error.mockRestore();
    log.mockRestore();
    info.mockRestore();
  });

  it("searches places without calling a public demonstration server", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse([
        {
          display_name: "Granby, QC",
          lat: 45.4001,
          lon: -72.7342,
        },
      ]),
    );
    const provider = new HttpGeocodingProvider(
      "https://geocoding.example.test/nominatim",
      fetcher,
    );

    await expect(provider.search("gran", "fr")).resolves.toEqual([
      {
        label: "Granby, QC",
        coordinates: GRANBY,
      },
    ]);
    const requested = String(fetcher.mock.calls.at(0)?.at(0));
    expect(requested).toContain("geocoding.example.test");
    expect(requested).not.toMatch(/nominatim\.openstreetmap\.org|demo/i);
  });
});
