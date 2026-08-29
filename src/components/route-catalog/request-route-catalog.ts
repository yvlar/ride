import { z } from "zod";
import type {
  RouteCatalogFilter,
  RouteCatalogPage,
} from "@/domain/route-catalog/types";

const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const regionSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  routeCount: z.number().int().nonnegative(),
});

const subdivisionSchema = z.object({
  code: z.string(),
  slug: z.string(),
  name: z.string(),
  type: z.enum(["province", "state", "territory", "district", "other"]),
  routeCount: z.number().int().nonnegative(),
  regions: z.array(regionSchema),
});

const countrySchema = z.object({
  code: z.string(),
  slug: z.string(),
  name: z.string(),
  routeCount: z.number().int().nonnegative(),
  subdivisions: z.array(subdivisionSchema),
});

const summarySchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  routeType: z.enum(["loop", "point_to_point"]),
  difficulty: z.enum(["easy", "moderate", "challenging"]),
  surface: z.enum(["paved", "mixed", "unpaved"]),
  distanceKm: z.number().positive(),
  durationMinutes: z.number().int().positive(),
  recommendedDays: z.object({
    min: z.number().int().positive(),
    max: z.number().int().positive(),
  }),
  season: z.object({
    startMonth: z.number().int().min(1).max(12).nullable(),
    endMonth: z.number().int().min(1).max(12).nullable(),
  }),
  start: z.object({ label: z.string(), coordinates: coordinatesSchema }),
  end: z.object({ label: z.string(), coordinates: coordinatesSchema }),
  tags: z.array(z.string()),
  location: z.object({
    country: z.object({ code: z.string(), slug: z.string(), name: z.string() }),
    subdivision: z.object({
      code: z.string(),
      slug: z.string(),
      name: z.string(),
      type: z.enum(["province", "state", "territory", "district", "other"]),
    }),
    region: z.object({ id: z.string().uuid(), slug: z.string(), name: z.string() }),
  }),
  gpx: z.object({
    filename: z.string(),
    version: z.number().int().positive(),
    sha256: z.string(),
    sizeBytes: z.number().int().positive(),
    pointCount: z.number().int().min(2),
  }),
});

const pageResponseSchema = z.object({
  data: z.object({
    countries: z.array(countrySchema),
    routes: z.array(summarySchema),
  }),
  meta: z.object({
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  }),
});

export type CatalogGpxDownload = {
  filename: string;
  xml: string;
};

export async function requestRouteCatalog(
  filter: RouteCatalogFilter = {},
  signal?: AbortSignal,
): Promise<RouteCatalogPage> {
  const params = new URLSearchParams();
  if (filter.countryCode) params.set("country", filter.countryCode);
  if (filter.subdivisionCode) params.set("subdivision", filter.subdivisionCode);
  if (filter.regionSlug) params.set("region", filter.regionSlug);
  if (filter.locale) params.set("locale", filter.locale);
  if (filter.limit !== undefined) params.set("limit", String(filter.limit));
  if (filter.offset !== undefined) params.set("offset", String(filter.offset));
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const response = await fetch(`/api/route-catalog${suffix}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(await responseError(response, "Catalogue indisponible."));
  }
  const parsed = pageResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("La réponse du catalogue est invalide.");
  }
  return {
    countries: parsed.data.data.countries,
    routes: parsed.data.data.routes,
    total: parsed.data.meta.total,
    limit: parsed.data.meta.limit,
    offset: parsed.data.meta.offset,
  };
}
export async function requestRouteCatalogGpx(
  slug: string,
  signal?: AbortSignal,
): Promise<CatalogGpxDownload> {
  const response = await fetch(`/api/route-catalog/${encodeURIComponent(slug)}/gpx`, {
    method: "GET",
    headers: { Accept: "application/gpx+xml" },
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(await responseError(response, "Fichier GPX indisponible."));
  }
  return {
    filename: responseFilename(response) ?? `${slug}.gpx`,
    xml: await response.text(),
  };
}

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null) {
      const error = (body as Record<string, unknown>).error;
      if (typeof error === "object" && error !== null) {
        const message = (error as Record<string, unknown>).message;
        if (typeof message === "string" && message.trim()) {
          return message;
        }
      }
    }
  } catch {
    // The status and the stable fallback are enough for non-JSON failures.
  }
  return fallback;
}

function responseFilename(response: Response): string | null {
  const disposition = response.headers.get("content-disposition");
  const match = disposition?.match(/filename="([^"]+)"/i);
  return match?.[1]?.trim() || null;
}
