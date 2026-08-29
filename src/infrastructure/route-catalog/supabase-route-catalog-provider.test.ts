import { describe, expect, it, vi } from "vitest";
import { SupabaseRouteCatalogProvider } from "./supabase-route-catalog-provider";

const regionId = "11111111-1111-4111-8111-111111111111";
const routeId = "22222222-2222-4222-8222-222222222222";
const sha256 = "a".repeat(64);

const treeRow = {
  country_code: "CA",
  country_slug: "canada",
  country_name_fr: "Canada",
  country_name_en: "Canada",
  country_sort_order: 10,
  subdivision_code: "CA-QC",
  subdivision_slug: "quebec",
  subdivision_name_fr: "Québec",
  subdivision_name_en: "Quebec",
  subdivision_type: "province",
  subdivision_sort_order: 10,
  region_id: regionId,
  region_parent_id: null,
  region_slug: "estrie",
  region_name_fr: "Estrie",
  region_name_en: "Eastern Townships",
  region_sort_order: 10,
  route_count: 1,
};

const catalogRow = {
  id: routeId,
  slug: "boucle-estrie",
  name_fr: "Boucle Estrie",
  name_en: "Eastern Townships Loop",
  description_fr: "Une belle boucle.",
  description_en: "A scenic loop.",
  route_type: "loop",
  difficulty: "moderate",
  surface: "paved",
  distance_km: 247.15,
  duration_minutes: 278,
  recommended_days_min: 1,
  recommended_days_max: 1,
  season_start_month: 5,
  season_end_month: 10,
  start_label: "Roxton Pond",
  end_label: "Roxton Pond",
  start_latitude: 45.475,
  start_longitude: -72.66,
  end_latitude: 45.475,
  end_longitude: -72.66,
  tags: ["lakes", "curves"],
  source_name: "Ride",
  source_url: "https://example.com/source",
  source_retrieved_at: "2026-08-28",
  published_at: "2026-08-28T12:00:00Z",
  country_code: "CA",
  country_slug: "canada",
  country_name_fr: "Canada",
  country_name_en: "Canada",
  subdivision_code: "CA-QC",
  subdivision_slug: "quebec",
  subdivision_type: "province",
  subdivision_name_fr: "Québec",
  subdivision_name_en: "Quebec",
  region_id: regionId,
  region_slug: "estrie",
  region_name_fr: "Estrie",
  region_name_en: "Eastern Townships",
  gpx_filename: "boucle-estrie.gpx",
  gpx_version: 1,
  gpx_sha256: sha256,
  gpx_size_bytes: 512,
  gpx_point_count: 3,
};

function json(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("SupabaseRouteCatalogProvider", () => {
  it("lists a localized hierarchy and applies server-side filters", async () => {
    const calls: URL[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      calls.push(url);
      if (url.pathname.endsWith("ride_route_catalog_tree")) {
        return json([treeRow]);
      }
      return json([catalogRow], { "Content-Range": "0-0/1" });
    }) as unknown as typeof fetch;
    const provider = new SupabaseRouteCatalogProvider(
      "https://project.supabase.co",
      "anon-key",
      { fetcher },
    );

    const page = await provider.list({
      countryCode: "ca",
      subdivisionCode: "ca-qc",
      regionSlug: "estrie",
      locale: "en",
      limit: 25,
      offset: 0,
    });

    expect(page.total).toBe(1);
    expect(page.countries[0]).toMatchObject({
      code: "CA",
      routeCount: 1,
      subdivisions: [
        {
          code: "CA-QC",
          name: "Quebec",
          routeCount: 1,
          regions: [{ slug: "estrie", name: "Eastern Townships", routeCount: 1 }],
        },
      ],
    });
    expect(page.routes[0]).toMatchObject({
      slug: "boucle-estrie",
      name: "Eastern Townships Loop",
      description: "A scenic loop.",
      routeType: "loop",
      location: { subdivision: { type: "province" } },
    });
    const routesUrl = calls.find((url) => url.pathname.endsWith("ride_route_catalog"));
    expect(routesUrl?.searchParams.get("country_code")).toBe("eq.CA");
    expect(routesUrl?.searchParams.get("subdivision_code")).toBe("eq.CA-QC");
    expect(routesUrl?.searchParams.get("region_slug")).toBe("eq.estrie");
    expect(routesUrl?.searchParams.get("limit")).toBe("25");
  });

  it("returns a detail with a simplified preview geometry", async () => {
    const fetcher = vi.fn(async () =>
      json([
        {
          ...catalogRow,
          preview_geojson: {
            type: "LineString",
            coordinates: [
              [-72.66, 45.475],
              [-72.5, 45.4],
            ],
          },
        },
      ]),
    ) as unknown as typeof fetch;
    const provider = new SupabaseRouteCatalogProvider(
      "https://project.supabase.co",
      "anon-key",
      { fetcher },
    );

    const detail = await provider.find("boucle-estrie");

    expect(detail?.previewGeometry.coordinates).toHaveLength(2);
    expect(detail?.source.url).toBe("https://example.com/source");
  });

  it("loads the GPX content only after resolving a published route", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("ride_route_catalog")) {
        return json([{ id: routeId, slug: "boucle-estrie" }]);
      }
      return json([
        {
          filename: "boucle-estrie.gpx",
          version: 1,
          sha256,
          content: "<gpx version=\"1.1\" />",
        },
      ]);
    }) as unknown as typeof fetch;
    const provider = new SupabaseRouteCatalogProvider(
      "https://project.supabase.co",
      "anon-key",
      { fetcher },
    );

    const asset = await provider.getGpx("boucle-estrie");

    expect(asset).toEqual({
      slug: "boucle-estrie",
      filename: "boucle-estrie.gpx",
      version: 1,
      sha256,
      content: "<gpx version=\"1.1\" />",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed upstream data instead of leaking it to the app", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      return url.pathname.endsWith("ride_route_catalog_tree")
        ? json([treeRow])
        : json([{ ...catalogRow, distance_km: "247" }]);
    }) as unknown as typeof fetch;
    const provider = new SupabaseRouteCatalogProvider(
      "https://project.supabase.co",
      "anon-key",
      { fetcher },
    );

    await expect(provider.list()).rejects.toThrow("invalide");
  });
});
