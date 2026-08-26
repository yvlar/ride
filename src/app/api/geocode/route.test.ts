import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/geocode (FR-017)", () => {
  it("returns matching places", async () => {
    const response = await GET(
      new Request("http://localhost/api/geocode?q=tremblant"),
    );
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
    const response = await GET(new Request("http://localhost/api/geocode?q=g"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("QUERY_TOO_SHORT");
  });
  it("passes the rider position to the provider and ranks by proximity (FR-032)", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/geocode?q=granby&latitude=45.4001&longitude=-72.7342",
      ),
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
    const response = await GET(
      new Request(
        "http://localhost/api/geocode?q=granby&latitude=abc&longitude=-72.7342",
      ),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.places.length).toBeGreaterThan(0);
  });

  it("normalizes a Canadian postal code however it is typed (FR-038)", async () => {
    for (const query of ["J2G2W4", "j2g 2w4", "J2G 2W4"]) {
      const response = await GET(
        new Request(`http://localhost/api/geocode?q=${encodeURIComponent(query)}`),
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
