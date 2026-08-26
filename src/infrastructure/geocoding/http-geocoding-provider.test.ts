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
  it("rejects the public Nominatim endpoint because it forbids autocomplete", () => {
    expect(
      () =>
        new HttpGeocodingProvider("https://nominatim.openstreetmap.org/"),
    ).toThrow(/interdit l’autocomplétion/i);
  });

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
      fullAddress: "12 Rue Principale, Granby, Québec, Canada",
      type: "address",
      source: "map",
      precision: "exact",
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
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return jsonResponse([
        {
          display_name: "Granby, QC",
          lat: 45.4001,
          lon: -72.7342,
        },
      ]);
    });
    const provider = new HttpGeocodingProvider(
      "https://geocoding.example.test/nominatim",
      fetcher,
    );

    await expect(provider.search("gran", "fr")).resolves.toEqual([
      {
        label: "Granby, QC",
        coordinates: GRANBY,
        fullAddress: "Granby, QC",
        type: "place",
        source: "search",
        precision: "exact",
      },
    ]);
    const requested = String(fetcher.mock.calls.at(0)?.at(0));
    expect(requested).toContain("geocoding.example.test");
    expect(requested).not.toMatch(/nominatim\.openstreetmap\.org|demo/i);
  });

  it("maps a complete address with municipality, province, country, and bounds", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse([
        {
          place_id: 101,
          display_name: "125 Rue Principale, Granby, Québec, J2G 2W4, Canada",
          lat: "45.401",
          lon: "-72.735",
          addresstype: "house",
          boundingbox: ["45.4009", "45.4011", "-72.7351", "-72.7349"],
          address: {
            house_number: "125",
            road: "Rue Principale",
            city: "Granby",
            state: "Québec",
            postcode: "j2g2w4",
            country: "Canada",
            country_code: "ca",
          },
        },
      ]),
    );
    const provider = new HttpGeocodingProvider(
      "https://geocoding.example.test/nominatim",
      fetcher,
    );

    await expect(provider.search("125 rue Principale", "fr")).resolves.toEqual([
      expect.objectContaining({
        id: "nominatim:101",
        label: "125 Rue Principale, Granby, Québec",
        name: "125 Rue Principale",
        locality: "Granby",
        region: "Québec",
        postalCode: "J2G 2W4",
        country: "Canada",
        countryCode: "CA",
        type: "address",
        source: "search",
        precision: "exact",
        bounds: {
          west: -72.7351,
          south: 45.4009,
          east: -72.7349,
          north: 45.4011,
        },
      }),
    ]);
  });

  it("keeps same-name cities distinguishable by province and country", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return jsonResponse([
        {
          place_id: 201,
          display_name: "Richmond, Estrie, Québec, Canada",
          name: "Richmond",
          lat: "45.6668",
          lon: "-72.1491",
          addresstype: "town",
          address: {
            town: "Richmond",
            state: "Québec",
            country: "Canada",
            country_code: "ca",
          },
        },
        {
          place_id: 202,
          display_name: "Richmond, Virginia, United States",
          name: "Richmond",
          lat: "37.5407",
          lon: "-77.436",
          addresstype: "city",
          address: {
            city: "Richmond",
            state: "Virginia",
            country: "United States",
            country_code: "us",
          },
        },
      ]);
    });
    const provider = new HttpGeocodingProvider(
      "https://geocoding.example.test/nominatim",
      fetcher,
    );

    const places = await provider.search("Richmond", "fr", {
      proximity: GRANBY,
    });

    expect(places.map((place) => place.id)).toEqual([
      "nominatim:201",
      "nominatim:202",
    ]);
    expect(places[0]).toEqual(
      expect.objectContaining({
        name: "Richmond",
        region: "Québec",
        country: "Canada",
        type: "city",
        precision: "approximate",
      }),
    );
    expect(places[1]).toEqual(
      expect.objectContaining({ region: "Virginia", country: "United States" }),
    );
    const requested = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(requested.searchParams.get("viewbox")).toBeTruthy();
    expect(requested.searchParams.get("bounded")).toBe("0");
    expect(requested.searchParams.has("countrycodes")).toBe(false);
  });

  it("normalizes a Canadian postal area and marks it approximate", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse([
        {
          place_id: 301,
          display_name: "J2G 2W4, Granby, Québec, Canada",
          lat: "45.4005",
          lon: "-72.735",
          addresstype: "postcode",
          boundingbox: ["45.39", "45.41", "-72.75", "-72.72"],
          address: {
            city: "Granby",
            state: "Québec",
            postcode: "j2g2w4",
            country: "Canada",
            country_code: "ca",
          },
        },
      ]),
    );
    const provider = new HttpGeocodingProvider(
      "https://geocoding.example.test/nominatim",
      fetcher,
    );

    await expect(provider.search("J2G 2W4", "fr")).resolves.toEqual([
      expect.objectContaining({
        label: "J2G 2W4, Granby, Québec, Canada",
        postalCode: "J2G 2W4",
        type: "postal_code",
        precision: "approximate",
      }),
    ]);
  });
});
