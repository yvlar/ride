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
      kind: "address",
      precision: "exact",
      source: "map",
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
        kind: "place",
        precision: "exact",
        source: "search",
      },
    ]);
    const requested = String(fetcher.mock.calls.at(0)?.at(0));
    expect(requested).toContain("geocoding.example.test");
    expect(requested).not.toMatch(/nominatim\.openstreetmap\.org|demo/i);
  });
  it("resolves a full street address with an exact precision (FR-038)", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse([
        {
          place_id: 42,
          display_name: "125 Rue Principale, Granby, Québec, J2G 2W4, Canada",
          lat: "45.4008",
          lon: "-72.7311",
          category: "building",
          type: "house",
          addresstype: "building",
          address: {
            house_number: "125",
            road: "Rue Principale",
            city: "Granby",
            state: "Québec",
            postcode: "J2G 2W4",
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

    const [place] = await provider.search(
      "125 rue Principale, Granby, Québec",
      "fr",
    );

    expect(place).toMatchObject({
      id: "42",
      name: "125 Rue Principale",
      locality: "Granby",
      region: "Québec",
      postalCode: "J2G 2W4",
      country: "Canada",
      kind: "address",
      precision: "exact",
      coordinates: { latitude: 45.4008, longitude: -72.7311 },
    });
  });

  it("resolves a municipality as an approximate city with official coordinates (FR-038)", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse([
        {
          display_name: "Roxton Pond, Québec, Canada",
          name: "Roxton Pond",
          lat: "45.4833",
          lon: "-72.6333",
          category: "place",
          type: "village",
          addresstype: "village",
          boundingbox: ["45.45", "45.52", "-72.68", "-72.59"],
          address: {
            village: "Roxton Pond",
            state: "Québec",
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

    const [place] = await provider.search("Roxton Pond", "fr");

    expect(place).toMatchObject({
      name: "Roxton Pond",
      region: "Québec",
      country: "Canada",
      kind: "city",
      precision: "approximate",
      // The geocoder's own coordinates are used, never a guess.
      coordinates: { latitude: 45.4833, longitude: -72.6333 },
      bounds: { west: -72.68, south: 45.45, east: -72.59, north: 45.52 },
    });
  });

  it("keeps same-name municipalities distinguishable by region and country (FR-032)", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse([
        {
          display_name: "Granby, Québec, Canada",
          name: "Granby",
          lat: "45.4001",
          lon: "-72.7342",
          category: "place",
          type: "town",
          address: { town: "Granby", state: "Québec", country: "Canada" },
        },
        {
          display_name: "Granby, Colorado, United States",
          name: "Granby",
          lat: "40.0866",
          lon: "-105.9372",
          category: "place",
          type: "town",
          address: {
            town: "Granby",
            state: "Colorado",
            country: "États-Unis",
          },
        },
      ]),
    );
    const provider = new HttpGeocodingProvider(
      "https://geocoding.example.test/nominatim",
      fetcher,
    );

    const places = await provider.search("Granby", "fr");

    expect(places).toHaveLength(2);
    expect(places.map((place) => place.region)).toEqual([
      "Québec",
      "Colorado",
    ]);
    expect(places.map((place) => place.country)).toEqual([
      "Canada",
      "États-Unis",
    ]);
    expect(places.map((place) => place.coordinates.latitude)).toEqual([
      45.4001, 40.0866,
    ]);
  });

  it("queries a postal code as a structured parameter (FR-038)", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse([
        {
          display_name: "J2G 2W4, Granby, Québec, Canada",
          lat: "45.4004",
          lon: "-72.7325",
          category: "place",
          type: "postcode",
          addresstype: "postcode",
          address: {
            postcode: "J2G 2W4",
            city: "Granby",
            state: "Québec",
            country: "Canada",
          },
        },
      ]),
    );
    const provider = new HttpGeocodingProvider(
      "https://geocoding.example.test/nominatim",
      fetcher,
    );

    const [place] = await provider.search("j2g 2w4", "fr");

    const requested = new URL(String(fetcher.mock.calls.at(0)?.at(0)));
    expect(requested.searchParams.get("postalcode")).toBe("J2G 2W4");
    expect(requested.searchParams.get("q")).toBeNull();
    expect(place).toMatchObject({
      kind: "postal_code",
      precision: "approximate",
      postalCode: "J2G 2W4",
    });
  });

  it("falls back to the forward sortation area when the full code is unknown (FR-038)", async () => {
    // OSM rarely carries a full Canadian postal code, so the first lookup is
    // empty and the area lookup answers instead.
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            display_name: "J2G, Granby, Québec, Canada",
            lat: "45.4",
            lon: "-72.73",
            category: "place",
            type: "postcode",
            addresstype: "postcode",
            boundingbox: ["45.36", "45.44", "-72.79", "-72.68"],
            address: {
              postcode: "J2G",
              city: "Granby",
              state: "Québec",
              country: "Canada",
            },
          },
        ]),
      );
    const provider = new HttpGeocodingProvider(
      "https://geocoding.example.test/nominatim",
      fetcher,
    );

    const [place] = await provider.search("J2G2W4", "fr");

    expect(fetcher).toHaveBeenCalledTimes(2);
    const second = new URL(String(fetcher.mock.calls.at(1)?.at(0)));
    expect(second.searchParams.get("postalcode")).toBe("J2G");
    expect(place).toMatchObject({
      kind: "postal_code",
      // The rider is told the point is a zone, and can nudge the marker.
      precision: "approximate",
      postalCode: "J2G 2W4",
      locality: "Granby",
    });
    expect(place?.bounds).toEqual({
      west: -72.79,
      south: 45.36,
      east: -72.68,
      north: 45.44,
    });
  });

  it("biases results towards the rider without excluding other regions (FR-032)", async () => {
    const fetcher = vi.fn(async () => jsonResponse([]));
    const provider = new HttpGeocodingProvider(
      "https://geocoding.example.test/nominatim",
      fetcher,
    );

    await provider.search("Magog", "fr", {
      proximity: { latitude: 45.4001, longitude: -72.7342 },
    });

    const requested = new URL(String(fetcher.mock.calls.at(0)?.at(0)));
    expect(requested.searchParams.get("viewbox")).toBe(
      "-73.7342,44.4001,-71.7342,46.4001",
    );
    // `bounded=0` keeps the box a preference rather than a filter.
    expect(requested.searchParams.get("bounded")).toBe("0");
    expect(requested.searchParams.get("countrycodes")).toBeNull();
  });
});
