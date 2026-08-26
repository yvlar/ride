import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/geocode (FR-017)", () => {
  it("returns matching places", async () => {
    const response = await GET(
      new Request("http://localhost/api/geocode?q=tremblant"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.places).toEqual([
      expect.objectContaining({
        label: "Mont-Tremblant, QC",
        coordinates: { latitude: 46.1185, longitude: -74.5962 },
        type: "city",
        region: "Québec",
        country: "Canada",
      }),
    ]);
    expect(response.headers.get("cache-control")).toMatch(/no-store/i);
    expect(body.meta.requestId).toEqual(expect.any(String));
  });

  it("rejects a query that is too short", async () => {
    const response = await GET(new Request("http://localhost/api/geocode?q=g"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("QUERY_TOO_SHORT");
  });

  it("accepts a complete address, a city, and a normalized Canadian postal code", async () => {
    const address = await GET(
      new Request("http://localhost/api/geocode?q=125%20rue%20Principale"),
    );
    const city = await GET(
      new Request("http://localhost/api/geocode?q=Sherbrooke%2C%20QC"),
    );
    const postal = await GET(
      new Request("http://localhost/api/geocode?q=j2g2w4"),
    );

    expect((await address.json()).data.places).toEqual([
      expect.objectContaining({ type: "address", locality: "Granby" }),
    ]);
    expect((await city.json()).data.places).toEqual([
      expect.objectContaining({ type: "city", name: "Sherbrooke" }),
    ]);
    expect((await postal.json()).data.places).toEqual([
      expect.objectContaining({
        postalCode: "J2G 2W4",
        precision: "approximate",
      }),
    ]);
  });

  it("rejects an incomplete or invalid proximity bias", async () => {
    for (const href of [
      "http://localhost/api/geocode?q=Granby&latitude=45.4",
      "http://localhost/api/geocode?q=Granby&latitude=91&longitude=-72.7",
      "http://localhost/api/geocode?q=Granby&latitude=&longitude=",
    ]) {
      const response = await GET(new Request(href));
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_PROXIMITY");
    }
  });
});
