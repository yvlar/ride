import { getRouteCatalogProvider } from "@/infrastructure/route-catalog/get-route-catalog-provider";
import {
  ROUTE_CATALOG_SLUG,
  routeCatalogError,
  routeCatalogJson,
  routeCatalogRequestId,
} from "../http";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const requestId = routeCatalogRequestId();
  const { slug } = await context.params;
  if (!ROUTE_CATALOG_SLUG.test(slug)) {
    return routeCatalogError(
      "INVALID_ROUTE_SLUG",
      "L’identifiant du trajet est invalide.",
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
  const locale = new URL(request.url).searchParams
    .get("locale")
    ?.toLowerCase()
    .startsWith("en")
    ? "en"
    : "fr";
  try {
    const route = await provider.find(slug, locale);
    if (!route) {
      return routeCatalogError(
        "ROUTE_NOT_FOUND",
        "Ce trajet n’existe pas ou n’est pas publié.",
        404,
        requestId,
      );
    }
    return routeCatalogJson({ data: { route }, meta: { requestId } });
  } catch (error) {
    console.error("[route-catalog] détail indisponible", error);
    return routeCatalogError(
      "CATALOG_UPSTREAM_ERROR",
      "Le catalogue de trajets est temporairement indisponible.",
      502,
      requestId,
    );
  }
}
