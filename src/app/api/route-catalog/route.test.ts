import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RouteCatalogProvider } from "@/domain/route-catalog/route-catalog-provider";

const catalog = vi.hoisted(() => ({
  provider: null as RouteCatalogProvider | null,
}));

vi.mock("@/infrastructure/route-catalog/get-route-catalog-provider", () => ({
  getRouteCatalogProvider: () => catalog.provider,
}));

async function get(query = ""): Promise<Response> {
  const { GET } = await import("./route");
  return GET(new Request(`http://localhost/api/route-catalog${query}`));
}

describe("GET /api/route-catalog", () => {
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    catalog.provider = null;
    errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => errorLog.mockRestore());

  it("returns the catalog page and normalized filters", async () => {
    const list = vi.fn().mockResolvedValue({
      countries: [],
      routes: [],
      total: 10,
      limit: 25,
      offset: 5,
    });
    catalog.provider = {
      list,
      find: vi.fn(),
      getGpx: vi.fn(),
    };

    const response = await get(
      "?country=ca&subdivision=ca-qc&region=estrie&locale=fr-CA&limit=25&offset=5",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledWith({
      countryCode: "CA",
      subdivisionCode: "CA-QC",
      regionSlug: "estrie",
      locale: "fr",
      limit: 25,
      offset: 5,
    });
    expect(body.meta).toMatchObject({ total: 10, limit: 25, offset: 5 });
    expect(body.meta.requestId).toEqual(expect.any(String));
  });

  it("rejects malformed filters before querying Supabase", async () => {
    const response = await get("?country=canada&limit=101");
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("INVALID_CATALOG_FILTER");
  });

  it("requires a subdivision when filtering by region", async () => {
    const response = await get("?country=CA&region=estrie");

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_CATALOG_FILTER");
  });

  it("returns 503 when the server-only Supabase configuration is absent", async () => {
    const response = await get();
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("CATALOG_UNAVAILABLE");
  });

  it("contains upstream failures and returns a stable API error", async () => {
    catalog.provider = {
      list: vi.fn().mockRejectedValue(new Error("database down")),
      find: vi.fn(),
      getGpx: vi.fn(),
    };

    const response = await get();

    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe("CATALOG_UPSTREAM_ERROR");
    expect(errorLog).toHaveBeenCalled();
  });
});
