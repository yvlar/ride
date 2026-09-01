import { describe, expect, it, vi } from "vitest";
import { PhotonGeocodingProvider } from "./photon-geocoding-provider";

const BASE_URL = "https://photon.example.test";
const ROXTON_POND = { latitude: 45.4553061, longitude: -72.6451156 };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function collection(...features: unknown[]): unknown {
  return { type: "FeatureCollection", features };
}

/** The house node photon.komoot.io returns for the address below. */
const BOULEAUX_FEATURE = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [-72.6451156, 45.4553061] },
  properties: {
    osm_type: "N",
    osm_id: 11725517458,
    osm_key: "place",
    osm_value: "house",
    type: "house",
    housenumber: "722",
    street: "Rue des Bouleaux",
    city: "Roxton Pond",
    county: "La Haute-Yamaska",
    state: "Québec",
    country: "Canada",
    postcode: "J0E 1Z0",
    countrycode: "CA",
  },
};

const ROXTON_POND_CITY_FEATURE = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [-72.6333, 45.4833] },
  properties: {
    osm_type: "R",
    osm_id: 7932100,
    osm_key: "place",
    osm_value: "city",
    type: "city",
    name: "Roxton Pond",
    state: "Québec",
    country: "Canada",
    countrycode: "CA",
    extent: [-72.7020666, 45.5387429, -72.578593, 45.4031491],
  },
};

function postcodeFeature(code: string, city: string): unknown {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [-72.7029663, 45.3357075] },
    // A postcode feature carries no osm_type/osm_id and no postcode field,
    // and reports `type: "other"`.
    properties: {
      osm_key: "place",
      osm_value: "postcode",
      type: "other",
      name: code,
      city,
      state: "Québec",
      country: "Canada",
      countrycode: "CA",
    },
  };
}

describe("PhotonGeocodingProvider search (FR-032, FR-038)", () => {
  it("maps a numbered address, keeping Photon's lon/lat order straight", async () => {
    const fetcher = vi.fn(async () => jsonResponse(collection(BOULEAUX_FEATURE)));
    const provider = new PhotonGeocodingProvider(BASE_URL, fetcher);

    const places = await provider.search(
      "722 rue des bouleaux roxton pond",
      "fr",
    );

    expect(places).toEqual([
      {
        label: "722 Rue des Bouleaux, Roxton Pond, Québec, Canada",
        coordinates: ROXTON_POND,
        kind: "address",
        precision: "exact",
        source: "search",
        id: "N11725517458",
        name: "722 Rue des Bouleaux",
        locality: "Roxton Pond",
        region: "Québec",
        postalCode: "J0E 1Z0",
        country: "Canada",
      },
    ]);
    // Guard against a silent [lat, lon] read: Québec is nowhere near -72°N.
    expect(places[0]?.coordinates.latitude).toBeCloseTo(45.455, 3);

    const requested = new URL(String(fetcher.mock.calls.at(0)?.at(0)));
    expect(requested.pathname.endsWith("/api")).toBe(true);
    expect(requested.searchParams.get("q")).toBe(
      "722 rue des bouleaux roxton pond",
    );
    expect(requested.searchParams.get("lang")).toBe("fr");
  });

  it("reads a municipality's extent in Photon's [west, north, east, south] order", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(collection(ROXTON_POND_CITY_FEATURE)),
    );
    const provider = new PhotonGeocodingProvider(BASE_URL, fetcher);

    const [place] = await provider.search("roxton pond", "fr");

    expect(place?.kind).toBe("city");
    expect(place?.precision).toBe("approximate");
    expect(place?.bounds).toEqual({
      west: -72.7020666,
      south: 45.4031491,
      east: -72.578593,
      north: 45.5387429,
    });
  });

  it("biases by position without ever filtering distant results (FR-032)", async () => {
    const fetcher = vi.fn(async () => jsonResponse(collection(BOULEAUX_FEATURE)));
    const provider = new PhotonGeocodingProvider(BASE_URL, fetcher);

    await provider.search("bouleaux", "fr", {
      proximity: { latitude: 45.4001, longitude: -72.7342 },
    });

    const requested = new URL(String(fetcher.mock.calls.at(0)?.at(0)));
    expect(requested.searchParams.get("lat")).toBe("45.4001");
    expect(requested.searchParams.get("lon")).toBe("-72.7342");
    // A bounding box or a raised bias scale would turn the preference into a
    // filter and hide a destination a province away.
    expect(requested.searchParams.get("bbox")).toBeNull();
    expect(requested.searchParams.get("bounded")).toBeNull();
    expect(requested.searchParams.get("location_bias_scale")).toBeNull();
  });

  it("omits an unsupported language rather than triggering an HTTP 400", async () => {
    const fetcher = vi.fn(async () => jsonResponse(collection(BOULEAUX_FEATURE)));
    const provider = new PhotonGeocodingProvider(BASE_URL, fetcher);

    await provider.search("granby", "es");

    const requested = new URL(String(fetcher.mock.calls.at(0)?.at(0)));
    expect(requested.searchParams.get("lang")).toBeNull();
  });

  it("over-fetches so de-duplication downstream still leaves a full list", async () => {
    const fetcher = vi.fn(async () => jsonResponse(collection()));
    const provider = new PhotonGeocodingProvider(BASE_URL, fetcher);

    await provider.search("rue principale", "fr");

    const requested = new URL(String(fetcher.mock.calls.at(0)?.at(0)));
    expect(requested.searchParams.get("limit")).toBe("16");
  });
});

describe("PhotonGeocodingProvider postal codes (FR-038, FR-040)", () => {
  it("keeps a postal code only when it is the one that was asked for", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(collection(postcodeFeature("J0E 1Z0", "Roxton Pond"))),
    );
    const provider = new PhotonGeocodingProvider(BASE_URL, fetcher);

    const places = await provider.search("J0E 1Z0", "fr");

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(places).toEqual([
      {
        label: "J0E 1Z0, Roxton Pond, Québec, Canada",
        coordinates: { latitude: 45.3357075, longitude: -72.7029663 },
        kind: "postal_code",
        precision: "approximate",
        source: "search",
        name: "J0E 1Z0",
        locality: "Roxton Pond",
        region: "Québec",
        postalCode: "J0E 1Z0",
        country: "Canada",
      },
    ]);
    // No osm_type/osm_id on a postcode feature, so no provider id is invented.
    expect(places[0]).not.toHaveProperty("id");
  });

  it("drops Photon's fuzzy postal-code matches and falls back to the area", async () => {
    // Asked for J2G 2W4, Photon offers J2C 2W8 (Drummondville) and J2L 2W8
    // (Bromont). Both are wrong, not approximate.
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(
          collection(
            postcodeFeature("J2C 2W8", "Drummondville"),
            postcodeFeature("J2L 2W8", "Bromont"),
          ),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          collection(
            postcodeFeature("J2G 3N4", "Granby"),
            postcodeFeature("J2G 8E1", "Granby"),
            postcodeFeature("J2J 1A1", "Granby"),
          ),
        ),
      );
    const provider = new PhotonGeocodingProvider(BASE_URL, fetcher);

    const places = await provider.search("J2G 2W4", "fr");

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetcher.mock.calls.at(1)?.at(0))).searchParams.get("q")).toBe(
      "J2G",
    );
    // The area codes answer one question, so they collapse into one offer
    // labelled with the code the rider typed — never Drummondville.
    expect(places).toEqual([
      {
        label: "J2G 2W4, Granby, Québec, Canada",
        coordinates: { latitude: 45.3357075, longitude: -72.7029663 },
        kind: "postal_code",
        precision: "approximate",
        source: "search",
        name: "J2G 2W4",
        locality: "Granby",
        region: "Québec",
        postalCode: "J2G 2W4",
        country: "Canada",
      },
    ]);
  });

  it("searches the area directly when only the sortation area was typed", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(collection(postcodeFeature("J2G 3N4", "Granby"))),
    );
    const provider = new PhotonGeocodingProvider(BASE_URL, fetcher);

    const places = await provider.search("J2G", "fr");

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(places).toEqual([
      expect.objectContaining({
        name: "J2G",
        postalCode: "J2G",
        kind: "postal_code",
        precision: "approximate",
      }),
    ]);
  });
});

describe("PhotonGeocodingProvider reverse (FR-017)", () => {
  it("keeps the exact GPS point and labels it", async () => {
    const fetcher = vi.fn(async () => jsonResponse(collection(BOULEAUX_FEATURE)));
    const provider = new PhotonGeocodingProvider(BASE_URL, fetcher);

    await expect(provider.reverse(ROXTON_POND, "fr")).resolves.toEqual({
      label: "722 Rue des Bouleaux, Roxton Pond, Québec, Canada",
      coordinates: ROXTON_POND,
      kind: "address",
      precision: "exact",
      source: "map",
      id: "N11725517458",
      name: "722 Rue des Bouleaux",
      locality: "Roxton Pond",
      region: "Québec",
      postalCode: "J0E 1Z0",
      country: "Canada",
    });

    const requested = new URL(String(fetcher.mock.calls.at(0)?.at(0)));
    expect(requested.pathname.endsWith("/reverse")).toBe(true);
    expect(requested.searchParams.get("lat")).toBe("45.4553061");
    expect(requested.searchParams.get("lon")).toBe("-72.6451156");
  });

  it("reports when no place matches the coordinates", async () => {
    const fetcher = vi.fn(async () => jsonResponse(collection()));
    const provider = new PhotonGeocodingProvider(BASE_URL, fetcher);

    await expect(provider.reverse(ROXTON_POND, "fr")).rejects.toThrow(
      "Aucun lieu trouvé pour ces coordonnées.",
    );
  });

  it("never logs the rider's coordinates (NFR-005)", async () => {
    const logs = vi.spyOn(console, "log").mockImplementation(() => {});
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetcher = vi.fn(async () => jsonResponse(collection(BOULEAUX_FEATURE)));
    const provider = new PhotonGeocodingProvider(BASE_URL, fetcher);

    await provider.reverse(ROXTON_POND, "fr");

    expect(logs).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    logs.mockRestore();
    errors.mockRestore();
  });
});

describe("PhotonGeocodingProvider transport", () => {
  it("sends the identifying headers and an optional bearer key", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(collection()));
    const provider = new PhotonGeocodingProvider(BASE_URL, fetcher, "secret");

    await provider.search("granby", "fr");

    const init = fetcher.mock.calls[0]?.[1];
    const headers = init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toContain("Ride/1.0");
    expect(headers.Authorization).toBe("Bearer secret");
    expect(init?.cache).toBe("no-store");
  });

  it("surfaces an HTTP failure", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ message: "nope" }, 503));
    const provider = new PhotonGeocodingProvider(BASE_URL, fetcher);

    await expect(provider.search("granby", "fr")).rejects.toThrow(
      "Géocodage HTTP 503",
    );
  });

  it("rejects a malformed external response", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ unexpected: true }));
    const provider = new PhotonGeocodingProvider(BASE_URL, fetcher);

    await expect(provider.search("granby", "fr")).rejects.toThrow(
      "Réponse de géocodage invalide.",
    );
  });

  it("refuses a base URL that is not HTTP or HTTPS", () => {
    expect(() => new PhotonGeocodingProvider("ftp://photon.example.test")).toThrow(
      "GEOCODING_API_BASE_URL doit utiliser HTTP ou HTTPS.",
    );
  });
});
