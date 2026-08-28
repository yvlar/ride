import { afterEach, describe, expect, it, vi } from "vitest";

const reverse = vi.fn();

vi.mock("@/infrastructure/geocoding/get-geocoding-provider", () => ({
  getGeocodingProvider: () => ({
    search: vi.fn(),
    reverse,
  }),
}));

describe("GET /api/geocode/reverse (FR-017)", () => {
  afterEach(() => {
    reverse.mockReset();
  });

  it("returns the reverse-geocoded place and keeps the requested coordinates", async () => {
    reverse.mockResolvedValue({
      label: "12 Rue Principale, Granby",
      coordinates: { latitude: 45.4, longitude: -72.73 },
    });
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "http://localhost/api/geocode/reverse?latitude=45.4001&longitude=-72.7342&locale=fr",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toMatch(/no-store/i);
    expect(reverse).toHaveBeenCalledWith(
      { latitude: 45.4001, longitude: -72.7342 },
      "fr",
    );
    expect(body.data.place).toEqual({
      label: "12 Rue Principale, Granby",
      coordinates: { latitude: 45.4001, longitude: -72.7342 },
    });
  });

  it("rejects missing, non-numeric or out-of-range coordinates", async () => {
    const { GET } = await import("./route");
    const cases = [
      "http://localhost/api/geocode/reverse?longitude=-72.7&locale=fr",
      "http://localhost/api/geocode/reverse?latitude=abc&longitude=-72.7",
      "http://localhost/api/geocode/reverse?latitude=91&longitude=-72.7",
      "http://localhost/api/geocode/reverse?latitude=45.4&longitude=200",
    ];

    for (const href of cases) {
      const response = await GET(new Request(href));
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(reverse).not.toHaveBeenCalled();
    }
  });

  it("rejects an invalid locale", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request(
        "http://localhost/api/geocode/reverse?latitude=45.4&longitude=-72.7&locale=not-a-locale!!",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(reverse).not.toHaveBeenCalled();
  });

  it("returns a provider error without leaking coordinates", async () => {
    reverse.mockRejectedValue(new Error("upstream down"));
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "http://localhost/api/geocode/reverse?latitude=45.4001&longitude=-72.7342&locale=fr",
      ),
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("PROVIDER_ERROR");
    expect(serialized).not.toContain("45.4001");
    expect(serialized).not.toContain("-72.7342");
  });
  it("keeps the descriptive fields the map picker needs (FR-038)", async () => {
    reverse.mockResolvedValue({
      label: "125 Rue Principale, Granby, Québec, Canada",
      name: "125 Rue Principale",
      addressLine: "125 Rue Principale",
      locality: "Granby",
      region: "Québec",
      postalCode: "J2G 2W4",
      country: "Canada",
      kind: "address",
      precision: "exact",
      coordinates: { latitude: 45.4, longitude: -72.73 },
    });
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "http://localhost/api/geocode/reverse?latitude=45.4001&longitude=-72.7342",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.place).toMatchObject({
      name: "125 Rue Principale",
      locality: "Granby",
      region: "Québec",
      postalCode: "J2G 2W4",
      country: "Canada",
      kind: "address",
      precision: "exact",
      // The requested point always wins over the geocoder's echo.
      coordinates: { latitude: 45.4001, longitude: -72.7342 },
    });
  });
});
