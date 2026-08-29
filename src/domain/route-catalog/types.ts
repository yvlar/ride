import type { Coordinates, LineString } from "@/domain/geo/types";

export type RouteCatalogLocale = "fr" | "en";

export type RouteCatalogFilter = {
  countryCode?: string;
  subdivisionCode?: string;
  regionSlug?: string;
  locale?: RouteCatalogLocale;
  limit?: number;
  offset?: number;
};
export type RouteCatalogRegion = {
  id: string;
  slug: string;
  name: string;
  routeCount: number;
};

export type RouteCatalogSubdivision = {
  code: string;
  slug: string;
  name: string;
  type: "province" | "state" | "territory" | "district" | "other";
  routeCount: number;
  regions: RouteCatalogRegion[];
};

export type RouteCatalogCountry = {
  code: string;
  slug: string;
  name: string;
  routeCount: number;
  subdivisions: RouteCatalogSubdivision[];
};

export type RouteCatalogLocation = {
  country: Pick<RouteCatalogCountry, "code" | "slug" | "name">;
  subdivision: Pick<RouteCatalogSubdivision, "code" | "slug" | "name" | "type">;
  region: Pick<RouteCatalogRegion, "id" | "slug" | "name">;
};

export type RouteCatalogSummary = {
  slug: string;
  name: string;
  description: string;
  routeType: "loop" | "point_to_point";
  difficulty: "easy" | "moderate" | "challenging";
  surface: "paved" | "mixed" | "unpaved";
  distanceKm: number;
  durationMinutes: number;
  recommendedDays: { min: number; max: number };
  season: { startMonth: number | null; endMonth: number | null };
  start: { label: string; coordinates: Coordinates };
  end: { label: string; coordinates: Coordinates };
  tags: string[];
  location: RouteCatalogLocation;
  gpx: {
    filename: string;
    version: number;
    sha256: string;
    sizeBytes: number;
    pointCount: number;
  };
};

export type RouteCatalogDetail = RouteCatalogSummary & {
  source: {
    name: string;
    url: string | null;
    retrievedAt: string | null;
  };
  publishedAt: string;
  previewGeometry: LineString;
};

export type RouteCatalogPage = {
  countries: RouteCatalogCountry[];
  routes: RouteCatalogSummary[];
  total: number;
  limit: number;
  offset: number;
};

export type RouteCatalogGpx = {
  slug: string;
  filename: string;
  version: number;
  sha256: string;
  content: string;
};
