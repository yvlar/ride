import type { RouteCatalogFilter } from "@/domain/route-catalog/types";
import { getRouteCatalogProvider } from "@/infrastructure/route-catalog/get-route-catalog-provider";
import {
  parseOptionalInteger,
  ROUTE_CATALOG_COUNTRY_CODE,
  ROUTE_CATALOG_SLUG,
  ROUTE_CATALOG_SUBDIVISION_CODE,
  routeCatalogError,
  routeCatalogJson,
  routeCatalogRequestId,
} from "./http";

export async function GET(request: Request): Promise<Response> {
  const requestId = routeCatalogRequestId();
  const url = new URL(request.url);
  const countryCode = url.searchParams.get("country")?.trim().toUpperCase();
  const subdivisionCode = url.searchParams
    .get("subdivision")
    ?.trim()
    .toUpperCase();
  const regionSlug = url.searchParams.get("region")?.trim().toLowerCase();
  const limit = parseOptionalInteger(url.searchParams.get("limit"), 1, 100);
  const offset = parseOptionalInteger(url.searchParams.get("offset"), 0, 10_000);
  const locale = url.searchParams.get("locale")?.toLowerCase().startsWith("en")
    ? "en"
    : "fr";

  if (
    (countryCode && !ROUTE_CATALOG_COUNTRY_CODE.test(countryCode)) ||
    (subdivisionCode &&
      !ROUTE_CATALOG_SUBDIVISION_CODE.test(subdivisionCode)) ||
    (regionSlug && !subdivisionCode) ||
    (regionSlug && !ROUTE_CATALOG_SLUG.test(regionSlug)) ||
    limit === "invalid" ||
    offset === "invalid"
  ) {
    return routeCatalogError(
      "INVALID_CATALOG_FILTER",
      "Les filtres du catalogue de trajets sont invalides.",
      400,
      requestId,
    );
  }

  const provider = getRouteCatalogProvider();
  if (!provider) {
    return routeCatalogError(
      "CATALOG_UNAVAILABLE",
      "Le catalogue de trajets n’est pas configuré.",
      503,
      requestId,
    );
  }

  const filter: RouteCatalogFilter = {
    countryCode: countryCode || undefined,
    subdivisionCode: subdivisionCode || undefined,
    regionSlug: regionSlug || undefined,
    locale,
    limit: limit ?? undefined,
    offset: offset ?? undefined,
  };

  try {
    const page = await provider.list(filter);
    return routeCatalogJson({
      data: { countries: page.countries, routes: page.routes },
      meta: {
        requestId,
        total: page.total,
        limit: page.limit,
        offset: page.offset,
      },
    });
  } catch (error) {
    console.error("[route-catalog] lecture indisponible", error);
    return routeCatalogError(
      "CATALOG_UPSTREAM_ERROR",
      "Le catalogue de trajets est temporairement indisponible.",
      502,
      requestId,
    );
  }
}
