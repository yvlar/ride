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
        label: "Mont-Tremblant, QC",
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
      },
    ]);
    expect(compact.data.places).toEqual(spaced.data.places);
  });

  it("falls back to the geocoding provider for an unknown postal code", async () => {
    postalCodes.provider = { find: vi.fn().mockResolvedValue(null) };

    const response = await get("http://localhost/api/geocode?q=J2G2W4");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.places).toEqual([]);
  });

  it("falls back and logs when the postal code lookup fails (FR-032)", async () => {
    postalCodes.provider = {
      find: vi.fn().mockRejectedValue(new Error("Supabase indisponible")),
    };

    const response = await get("http://localhost/api/geocode?q=J2G2W4");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.places).toEqual([]);
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
    expect(body.data.places).toEqual([
      {
        label: "Granby, QC",
        coordinates: { latitude: 45.4001, longitude: -72.7342 },
      },
    ]);
  });
});
