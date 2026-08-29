import { z } from "zod";
import type { LineString } from "@/domain/geo/types";
import type { RouteCatalogProvider } from "@/domain/route-catalog/route-catalog-provider";
import type {
  RouteCatalogCountry,
  RouteCatalogDetail,
  RouteCatalogFilter,
  RouteCatalogGpx,
  RouteCatalogLocale,
  RouteCatalogPage,
  RouteCatalogSubdivision,
  RouteCatalogSummary,
} from "@/domain/route-catalog/types";

export const ROUTE_CATALOG_REQUEST_TIMEOUT_MS = 10_000;
export const ROUTE_CATALOG_DEFAULT_LIMIT = 50;
export const ROUTE_CATALOG_MAX_LIMIT = 100;

const lineStringSchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
});

const treeRowSchema = z.object({
  country_code: z.string().length(2),
  country_slug: z.string().min(1),
  country_name_fr: z.string().min(1),
  country_name_en: z.string().min(1),
  country_sort_order: z.number().int(),
  subdivision_code: z.string().nullable(),
  subdivision_slug: z.string().nullable(),
  subdivision_name_fr: z.string().nullable(),
  subdivision_name_en: z.string().nullable(),
  subdivision_type: z
    .enum(["province", "state", "territory", "district", "other"])
    .nullable(),
  subdivision_sort_order: z.number().int().nullable(),
  region_id: z.string().uuid().nullable(),
  region_parent_id: z.string().uuid().nullable(),
  region_slug: z.string().nullable(),
  region_name_fr: z.string().nullable(),
  region_name_en: z.string().nullable(),
  region_sort_order: z.number().int().nullable(),
  route_count: z.number().int().nonnegative(),
});

const treeRowsSchema = z.array(treeRowSchema);

const catalogRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  name_fr: z.string().min(1),
  name_en: z.string().nullable(),
  description_fr: z.string(),
  description_en: z.string().nullable(),
  route_type: z.enum(["loop", "point_to_point"]),
  difficulty: z.enum(["easy", "moderate", "challenging"]),
  surface: z.enum(["paved", "mixed", "unpaved"]),
  distance_km: z.number().positive(),
  duration_minutes: z.number().int().positive(),
  recommended_days_min: z.number().int().positive(),
  recommended_days_max: z.number().int().positive(),
  season_start_month: z.number().int().min(1).max(12).nullable(),
  season_end_month: z.number().int().min(1).max(12).nullable(),
  start_label: z.string().min(1),
  end_label: z.string().min(1),
  start_latitude: z.number().min(-90).max(90),
  start_longitude: z.number().min(-180).max(180),
  end_latitude: z.number().min(-90).max(90),
  end_longitude: z.number().min(-180).max(180),
  tags: z.array(z.string()),
  source_name: z.string().min(1),
  source_url: z.string().url().nullable(),
  source_retrieved_at: z.string().nullable(),
  published_at: z.string().min(1),
  country_code: z.string().length(2),
  country_slug: z.string().min(1),
  country_name_fr: z.string().min(1),
  country_name_en: z.string().min(1),
  subdivision_code: z.string().min(1),
  subdivision_slug: z.string().min(1),
  subdivision_type: z.enum([
    "province",
    "state",
    "territory",
    "district",
    "other",
  ]),
  subdivision_name_fr: z.string().min(1),
  subdivision_name_en: z.string().min(1),
  region_id: z.string().uuid(),
  region_slug: z.string().min(1),
  region_name_fr: z.string().min(1),
  region_name_en: z.string().min(1),
  gpx_filename: z.string().min(1),
  gpx_version: z.number().int().positive(),
  gpx_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  gpx_size_bytes: z.number().int().positive(),
  gpx_point_count: z.number().int().min(2),
  preview_geojson: lineStringSchema.optional(),
});

const catalogRowsSchema = z.array(catalogRowSchema);

const assetRowsSchema = z.array(
  z.object({
    filename: z.string().min(1),
    version: z.number().int().positive(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    content: z.string().min(1),
  }),
);

type CatalogRow = z.infer<typeof catalogRowSchema>;
type TreeRow = z.infer<typeof treeRowSchema>;

export type SupabaseRouteCatalogProviderOptions = {
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

export class SupabaseRouteCatalogProvider implements RouteCatalogProvider {
  private readonly baseUrl: URL;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(
    baseUrl: string,
    private readonly apiKey: string,
    options: SupabaseRouteCatalogProviderOptions = {},
  ) {
    this.baseUrl = parseBaseUrl(baseUrl);
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? ROUTE_CATALOG_REQUEST_TIMEOUT_MS;
  }

  async list(filter: RouteCatalogFilter = {}): Promise<RouteCatalogPage> {
    const locale = filter.locale ?? "fr";
    const limit = clampInteger(
      filter.limit,
      1,
      ROUTE_CATALOG_MAX_LIMIT,
      ROUTE_CATALOG_DEFAULT_LIMIT,
    );
    const offset = clampInteger(filter.offset, 0, 10_000, 0);
    const treeUrl = this.endpoint("ride_route_catalog_tree");
    treeUrl.searchParams.set(
      "select",
      [
        "country_code",
        "country_slug",
        "country_name_fr",
        "country_name_en",
        "country_sort_order",
        "subdivision_code",
        "subdivision_slug",
        "subdivision_name_fr",
        "subdivision_name_en",
        "subdivision_type",
        "subdivision_sort_order",
        "region_id",
        "region_parent_id",
        "region_slug",
        "region_name_fr",
        "region_name_en",
        "region_sort_order",
        "route_count",
      ].join(","),
    );
    treeUrl.searchParams.set(
      "order",
      "country_sort_order.asc,subdivision_sort_order.asc,region_sort_order.asc",
    );

    const routesUrl = this.endpoint("ride_route_catalog");
    routesUrl.searchParams.set("select", summarySelect());
    routesUrl.searchParams.set("order", "published_at.desc,slug.asc");
    routesUrl.searchParams.set("limit", String(limit));
    routesUrl.searchParams.set("offset", String(offset));
    applyFilter(routesUrl, filter);

    const [treeResponse, routesResponse] = await Promise.all([
      this.request(treeUrl),
      this.request(routesUrl, { Prefer: "count=exact" }),
    ]);
    const treePayload = await parseJson(treeResponse, "arbre du catalogue");
    const routesPayload = await parseJson(routesResponse, "liste des trajets");
    const parsedTree = treeRowsSchema.safeParse(treePayload);
    const parsedRoutes = catalogRowsSchema.safeParse(routesPayload);
    if (!parsedTree.success || !parsedRoutes.success) {
      throw new Error("Réponse du catalogue Ride invalide.");
    }

    return {
      countries: buildTree(parsedTree.data, locale),
      routes: parsedRoutes.data.map((row) => toSummary(row, locale)),
      total: responseCount(routesResponse) ?? parsedRoutes.data.length,
      limit,
      offset,
    };
  }

  async find(
    slug: string,
    locale: RouteCatalogLocale = "fr",
  ): Promise<RouteCatalogDetail | null> {
    const url = this.endpoint("ride_route_catalog");
    url.searchParams.set("select", `${summarySelect()},preview_geojson`);
    url.searchParams.set("slug", `eq.${slug}`);
    url.searchParams.set("limit", "1");
    const payload = await parseJson(await this.request(url), "détail du trajet");
    const parsed = catalogRowsSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error("Réponse du catalogue Ride invalide.");
    }
    const row = parsed.data[0];
    if (!row) {
      return null;
    }
    if (!row.preview_geojson) {
      throw new Error("Aperçu géographique du trajet manquant.");
    }
    return {
      ...toSummary(row, locale),
      source: {
        name: row.source_name,
        url: row.source_url,
        retrievedAt: row.source_retrieved_at,
      },
      publishedAt: row.published_at,
      previewGeometry: row.preview_geojson as LineString,
    };
  }

  async getGpx(slug: string): Promise<RouteCatalogGpx | null> {
    const routeUrl = this.endpoint("ride_route_catalog");
    routeUrl.searchParams.set("select", "id,slug");
    routeUrl.searchParams.set("slug", `eq.${slug}`);
    routeUrl.searchParams.set("limit", "1");
    const routePayload = await parseJson(
      await this.request(routeUrl),
      "trajet GPX",
    );
    const routeRows = z
      .array(z.object({ id: z.string().uuid(), slug: z.string() }))
      .safeParse(routePayload);
    if (!routeRows.success) {
      throw new Error("Réponse du catalogue Ride invalide.");
    }
    const route = routeRows.data[0];
    if (!route) {
      return null;
    }

    const assetUrl = this.endpoint("ride_route_assets");
    assetUrl.searchParams.set("select", "filename,version,sha256,content");
    assetUrl.searchParams.set("route_id", `eq.${route.id}`);
    assetUrl.searchParams.set("asset_type", "eq.gpx");
    assetUrl.searchParams.set("is_primary", "eq.true");
    assetUrl.searchParams.set("limit", "1");
    const assetPayload = await parseJson(
      await this.request(assetUrl),
      "fichier GPX",
    );
    const assets = assetRowsSchema.safeParse(assetPayload);
    if (!assets.success) {
      throw new Error("Réponse GPX du catalogue Ride invalide.");
    }
    const asset = assets.data[0];
    return asset ? { slug: route.slug, ...asset } : null;
  }

  private endpoint(name: string): URL {
    return new URL(`rest/v1/${name}`, this.baseUrl);
  }

  private async request(
    url: URL,
    extraHeaders: Record<string, string> = {},
  ): Promise<Response> {
    const response = await this.fetcher(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        apikey: this.apiKey,
        Authorization: `Bearer ${this.apiKey}`,
        ...extraHeaders,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Catalogue Ride HTTP ${response.status}`);
    }
    return response;
  }
}

function parseBaseUrl(value: string): URL {
  const url = new URL(value.endsWith("/") ? value : `${value}/`);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("SUPABASE_URL doit utiliser HTTP ou HTTPS.");
  }
  return url;
}

function clampInteger(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isInteger(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value!));
}

function applyFilter(url: URL, filter: RouteCatalogFilter): void {
  if (filter.countryCode) {
    url.searchParams.set("country_code", `eq.${filter.countryCode.toUpperCase()}`);
  }
  if (filter.subdivisionCode) {
    url.searchParams.set(
      "subdivision_code",
      `eq.${filter.subdivisionCode.toUpperCase()}`,
    );
  }
  if (filter.regionSlug) {
    url.searchParams.set("region_slug", `eq.${filter.regionSlug}`);
  }
}

function summarySelect(): string {
  return [
    "id",
    "slug",
    "name_fr",
    "name_en",
    "description_fr",
    "description_en",
    "route_type",
    "difficulty",
    "surface",
    "distance_km",
    "duration_minutes",
    "recommended_days_min",
    "recommended_days_max",
    "season_start_month",
    "season_end_month",
    "start_label",
    "end_label",
    "start_latitude",
    "start_longitude",
    "end_latitude",
    "end_longitude",
    "tags",
    "source_name",
    "source_url",
    "source_retrieved_at",
    "published_at",
    "country_code",
    "country_slug",
    "country_name_fr",
    "country_name_en",
    "subdivision_code",
    "subdivision_slug",
    "subdivision_type",
    "subdivision_name_fr",
    "subdivision_name_en",
    "region_id",
    "region_slug",
    "region_name_fr",
    "region_name_en",
    "gpx_filename",
    "gpx_version",
    "gpx_sha256",
    "gpx_size_bytes",
    "gpx_point_count",
  ].join(",");
}

async function parseJson(response: Response, label: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error(`Réponse ${label} illisible.`);
  }
}

function responseCount(response: Response): number | null {
  const total = response.headers.get("content-range")?.split("/")[1];
  if (!total || total === "*") {
    return null;
  }
  const parsed = Number(total);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function localized(
  locale: RouteCatalogLocale,
  french: string,
  english: string | null,
): string {
  return locale === "en" && english?.trim() ? english.trim() : french.trim();
}

function toSummary(
  row: CatalogRow,
  locale: RouteCatalogLocale,
): RouteCatalogSummary {
  return {
    slug: row.slug,
    name: localized(locale, row.name_fr, row.name_en),
    description: localized(locale, row.description_fr, row.description_en),
    routeType: row.route_type,
    difficulty: row.difficulty,
    surface: row.surface,
    distanceKm: row.distance_km,
    durationMinutes: row.duration_minutes,
    recommendedDays: {
      min: row.recommended_days_min,
      max: row.recommended_days_max,
    },
    season: {
      startMonth: row.season_start_month,
      endMonth: row.season_end_month,
    },
    start: {
      label: row.start_label,
      coordinates: {
        latitude: row.start_latitude,
        longitude: row.start_longitude,
      },
    },
    end: {
      label: row.end_label,
      coordinates: {
        latitude: row.end_latitude,
        longitude: row.end_longitude,
      },
    },
    tags: [...row.tags],
    location: {
      country: {
        code: row.country_code,
        slug: row.country_slug,
        name: localized(locale, row.country_name_fr, row.country_name_en),
      },
      subdivision: {
        code: row.subdivision_code,
        slug: row.subdivision_slug,
        name: localized(
          locale,
          row.subdivision_name_fr,
          row.subdivision_name_en,
        ),
        type: row.subdivision_type,
      },
      region: {
        id: row.region_id,
        slug: row.region_slug,
        name: localized(locale, row.region_name_fr, row.region_name_en),
      },
    },
    gpx: {
      filename: row.gpx_filename,
      version: row.gpx_version,
      sha256: row.gpx_sha256,
      sizeBytes: row.gpx_size_bytes,
      pointCount: row.gpx_point_count,
    },
  };
}

function buildTree(
  rows: TreeRow[],
  locale: RouteCatalogLocale,
): RouteCatalogCountry[] {
  const countries = new Map<
    string,
    RouteCatalogCountry & { subdivisionsByCode: Map<string, RouteCatalogSubdivision> }
  >();

  for (const row of rows) {
    let country = countries.get(row.country_code);
    if (!country) {
      country = {
        code: row.country_code,
        slug: row.country_slug,
        name: localized(locale, row.country_name_fr, row.country_name_en),
        routeCount: 0,
        subdivisions: [],
        subdivisionsByCode: new Map(),
      };
      countries.set(row.country_code, country);
    }
    if (
      !row.subdivision_code ||
      !row.subdivision_slug ||
      !row.subdivision_name_fr ||
      !row.subdivision_name_en ||
      !row.subdivision_type
    ) {
      continue;
    }
    let subdivision = country.subdivisionsByCode.get(row.subdivision_code);
    if (!subdivision) {
      subdivision = {
        code: row.subdivision_code,
        slug: row.subdivision_slug,
        name: localized(
          locale,
          row.subdivision_name_fr,
          row.subdivision_name_en,
        ),
        type: row.subdivision_type,
        routeCount: 0,
        regions: [],
      };
      country.subdivisionsByCode.set(row.subdivision_code, subdivision);
      country.subdivisions.push(subdivision);
    }
    if (
      row.region_id &&
      row.region_slug &&
      row.region_name_fr &&
      row.region_name_en
    ) {
      subdivision.regions.push({
        id: row.region_id,
        slug: row.region_slug,
        name: localized(locale, row.region_name_fr, row.region_name_en),
        routeCount: row.route_count,
      });
      subdivision.routeCount += row.route_count;
      country.routeCount += row.route_count;
    }
  }

  return [...countries.values()].map((country) => ({
    code: country.code,
    slug: country.slug,
    name: country.name,
    routeCount: country.routeCount,
    subdivisions: country.subdivisions,
  }));
}
