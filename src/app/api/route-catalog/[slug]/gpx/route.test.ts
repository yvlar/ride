import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RouteCatalogProvider } from "@/domain/route-catalog/route-catalog-provider";

const catalog = vi.hoisted(() => ({
  provider: null as RouteCatalogProvider | null,
}));

vi.mock("@/infrastructure/route-catalog/get-route-catalog-provider", () => ({
  getRouteCatalogProvider: () => catalog.provider,
}));

const sha256 = "b".repeat(64);

async function get(slug: string, headers?: HeadersInit): Promise<Response> {
  const { GET } = await import("./route");
  return GET(
    new Request(`http://localhost/api/route-catalog/${slug}/gpx`, { headers }),
    { params: Promise.resolve({ slug }) },
  );
}

beforeEach(() => {
  catalog.provider = null;
});
describe("GET /api/route-catalog/[slug]/gpx", () => {
  it("returns a safe, cacheable GPX download", async () => {
    catalog.provider = {
      list: vi.fn(),
      find: vi.fn(),
      getGpx: vi.fn().mockResolvedValue({
        slug: "route-du-fjord",
        filename: "route-du-fjord.gpx",
        version: 1,
        sha256,
        content: "<?xml version=\"1.0\"?><gpx />",
      }),
    };

    const response = await get("route-du-fjord");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/gpx+xml");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="route-du-fjord.gpx"',
    );
    expect(response.headers.get("etag")).toBe(`"${sha256}"`);
    expect(await response.text()).toContain("<gpx");
  });

  it("honors a matching ETag without returning the file again", async () => {
    catalog.provider = {
      list: vi.fn(),
      find: vi.fn(),
      getGpx: vi.fn().mockResolvedValue({
        slug: "route-du-fjord",
        filename: "route-du-fjord.gpx",
        version: 1,
        sha256,
        content: "<gpx />",
      }),
    };

    const response = await get("route-du-fjord", {
      "If-None-Match": `"${sha256}"`,
    });

    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
  });

  it("returns 404 without exposing asset internals", async () => {
    catalog.provider = {
      list: vi.fn(),
      find: vi.fn(),
      getGpx: vi.fn().mockResolvedValue(null),
    };

    const response = await get("route-inconnue");
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("ROUTE_NOT_FOUND");
  });
});
