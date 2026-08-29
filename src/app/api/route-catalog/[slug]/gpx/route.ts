import { getRouteCatalogProvider } from "@/infrastructure/route-catalog/get-route-catalog-provider";
import {
  ROUTE_CATALOG_SLUG,
  routeCatalogError,
  routeCatalogRequestId,
  safeDownloadFilename,
} from "../../http";

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
  try {
    const asset = await provider.getGpx(slug);
    if (!asset) {
      return routeCatalogError(
        "ROUTE_NOT_FOUND",
        "Ce trajet n’existe pas ou son GPX n’est pas publié.",
        404,
        requestId,
      );
    }
    const etag = `"${asset.sha256}"`;
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } });
    }
    return new Response(asset.content, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
        "Content-Disposition": `attachment; filename="${safeDownloadFilename(asset.filename)}"`,
        "Content-Type": "application/gpx+xml; charset=utf-8",
        ETag: etag,
        "X-Content-Type-Options": "nosniff",
        "X-Request-Id": requestId,
      },
    });
  } catch (error) {
    console.error("[route-catalog] GPX indisponible", error);
    return routeCatalogError(
      "CATALOG_UPSTREAM_ERROR",
      "Le fichier GPX est temporairement indisponible.",
      502,
      requestId,
    );
  }
}
