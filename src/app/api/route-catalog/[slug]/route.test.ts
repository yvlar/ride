import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RouteCatalogProvider } from "@/domain/route-catalog/route-catalog-provider";
import type { RouteCatalogDetail } from "@/domain/route-catalog/types";

const catalog = vi.hoisted(() => ({
  provider: null as RouteCatalogProvider | null,
}));

vi.mock("@/infrastructure/route-catalog/get-route-catalog-provider", () => ({
  getRouteCatalogProvider: () => catalog.provider,
}));

async function get(slug: string, query = ""): Promise<Response> {
  const { GET } = await import("./route");
  return GET(
    new Request(`http://localhost/api/route-catalog/${slug}${query}`),
    { params: Promise.resolve({ slug }) },
  );
}

beforeEach(() => {
  catalog.provider = null;
});
describe("GET /api/route-catalog/[slug]", () => {
  it("returns a published route detail", async () => {
    const detail = { slug: "route-du-fjord" } as RouteCatalogDetail;
    const find = vi.fn().mockResolvedValue(detail);
    catalog.provider = { list: vi.fn(), find, getGpx: vi.fn() };

    const response = await get("route-du-fjord", "?locale=en-CA");

    expect(response.status).toBe(200);
    expect(find).toHaveBeenCalledWith("route-du-fjord", "en");
    expect((await response.json()).data.route.slug).toBe("route-du-fjord");
  });

  it("does not reveal a missing or unpublished route", async () => {
    catalog.provider = {
      list: vi.fn(),
      find: vi.fn().mockResolvedValue(null),
      getGpx: vi.fn(),
    };

    const response = await get("route-privee");
    expect(response.status).toBe(404);
  });
});
