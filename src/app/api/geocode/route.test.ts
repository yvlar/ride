import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostalCodeProvider } from "@/domain/postal-codes/postal-code-provider";

const postalCodes = vi.hoisted(() => ({
  provider: null as PostalCodeProvider | null,
}));

vi.mock("@/infrastructure/postal-codes/get-postal-code-provider", () => ({
  getPostalCodeProvider: () => postalCodes.provider,
}));

async function get(url: string): Promise<Response> {
  const { GET } = await import("./route");
  return GET(new Request(url));
}

beforeEach(() => {
  postalCodes.provider = null;
});

describe("GET /api/geocode (FR-017)", () => {
  it("returns matching places", async () => {
    const response = await get("http://localhost/api/geocode?q=tremblant");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.places).toEqual([
      {
        label: "Mont-Tremblant, Québec, Canada",
        name: "Mont-Tremblant",
        locality: "Mont-Tremblant",
        region: "Québec",
        country: "Canada",
        kind: "city",
        precision: "approximate",
        coordinates: { latitude: 46.1185, longitude: -74.5962 },
      },
    ]);
    expect(body.meta.requestId).toEqual(expect.any(String));
  });

  it("rejects a query that is too short", async () => {
    const response = await get("http://localhost/api/geocode?q=g");
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("QUERY_TOO_SHORT");
  });
  it("passes the rider position to the provider and ranks by proximity (FR-032)", async () => {
    const response = await get(
      "http://localhost/api/geocode?q=granby&latitude=45.4001&longitude=-72.7342",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    const labels = body.data.places.map(
      (place: { label: string }) => place.label,
    );
    // Québec first, the US homonym kept but ranked lower (never filtered).
    expect(labels[0]).toContain("Québec");
    expect(labels).toContain("Granby, Colorado, États-Unis");
  });

  it("ignores a malformed position rather than failing the search", async () => {
    const response = await get(
      "http://localhost/api/geocode?q=granby&latitude=abc&longitude=-72.7342",
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.places.length).toBeGreaterThan(0);
  });

  it("normalizes a Canadian postal code however it is typed (FR-038)", async () => {
    for (const query of ["J2G2W4", "j2g 2w4", "J2G 2W4"]) {
      const response = await get(
        `http://localhost/api/geocode?q=${encodeURIComponent(query)}`,
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.places[0]).toMatchObject({
        kind: "postal_code",
        postalCode: "J2G 2W4",
        precision: "approximate",
      });
    }
  });

  it("reports a provider outage as a 503 instead of crashing (FR-032)", async () => {
    vi.resetModules();
    vi.doMock("@/infrastructure/geocoding/get-geocoding-provider", () => ({
      getGeocodingProvider: () => ({
        search: async () => {
          throw new Error("provider down");
        },
        reverse: async () => {
          throw new Error("provider down");
        },
      }),
    }));

    const { GET: failingGet } = await import("./route");
    const response = await failingGet(
      new Request("http://localhost/api/geocode?q=granby"),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("PROVIDER_ERROR");

    vi.doUnmock("@/infrastructure/geocoding/get-geocoding-provider");
    vi.resetModules();
  });
});

describe("GET /api/geocode — code postal (FR-040)", () => {
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorLog.mockRestore();
  });

  it("resolves a Quebec postal code, spaced or compact", async () => {
    postalCodes.provider = {
      find: vi.fn().mockResolvedValue({
        postalCode: "J2G2W4",
        latitude: 45.4008,
        longitude: -72.7331,
        municipality: "Granby",
        region: "QC",
      }),
    };

    const spaced = await (
      await get("http://localhost/api/geocode?q=J2G%202W4")
    ).json();
    const compact = await (
      await get("http://localhost/api/geocode?q=j2g2w4")
    ).json();

    expect(spaced.data.places).toEqual([
      {
        label: "J2G 2W4, Granby, QC",
        coordinates: { latitude: 45.4008, longitude: -72.7331 },
        name: "J2G 2W4",
        locality: "Granby",
        region: "QC",
        // The reference base gives a real point, so the destination is exact.
        kind: "postal_code",
        precision: "exact",
        source: "search",
        postalCode: "J2G 2W4",
      },
    ]);
    expect(compact.data.places).toEqual(spaced.data.places);
  });

  it("falls back to the geocoding provider for an unknown postal code", async () => {
    postalCodes.provider = { find: vi.fn().mockResolvedValue(null) };

    const response = await get("http://localhost/api/geocode?q=J2G2W4");
    const body = await response.json();

    expect(response.status).toBe(200);
    // The geocoding provider answered instead of the reference base, so the
    // result is a zone rather than an exact point (FR-038).
    expect(body.data.places[0]).toMatchObject({
      kind: "postal_code",
      precision: "approximate",
    });
  });

  it("falls back and logs when the postal code lookup fails (FR-032)", async () => {
    postalCodes.provider = {
      find: vi.fn().mockRejectedValue(new Error("Supabase indisponible")),
    };

    const response = await get("http://localhost/api/geocode?q=J2G2W4");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.places[0]).toMatchObject({ kind: "postal_code" });
    expect(body.error).toBeUndefined();
    expect(errorLog).toHaveBeenCalled();
  });

  it("keeps city search on the geocoding provider", async () => {
    const find = vi.fn();
    postalCodes.provider = { find };

    const body = await (
      await get("http://localhost/api/geocode?q=granby")
    ).json();

    expect(find).not.toHaveBeenCalled();
    expect(body.data.places[0]).toMatchObject({
      label: "Granby, Québec, Canada",
      kind: "city",
      coordinates: { latitude: 45.4001, longitude: -72.7342 },
    });
  });
});
