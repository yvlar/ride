import { getGeocodingProvider } from "@/infrastructure/geocoding/get-geocoding-provider";
import { MOCK_GEOCODING_MIN_QUERY_LENGTH } from "@/infrastructure/geocoding/mock-geocoding-provider";
import { normalizeGeocodingQuery } from "@/domain/geo/canadian-postal-code";
import { hasValidCoordinates } from "@/domain/geo/coordinates";
import type { Coordinates } from "@/domain/geo/types";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

function requestId(): string {
  return crypto.randomUUID();
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const query = normalizeGeocodingQuery(url.searchParams.get("q") ?? "");
  const locale = url.searchParams.get("locale")?.trim() || "fr";

  if (query.length < MOCK_GEOCODING_MIN_QUERY_LENGTH) {
    return jsonResponse(
      {
        error: {
          code: "QUERY_TOO_SHORT",
          message: "Saisissez au moins deux caractères pour chercher un lieu.",
        },
        meta: { requestId: requestId() },
      },
      400,
    );
  }

  const proximity = optionalProximity(url.searchParams);
  if (proximity === null) {
    return jsonResponse(
      {
        error: {
          code: "INVALID_PROXIMITY",
          message: "La position utilisée pour prioriser les résultats est invalide.",
        },
        meta: { requestId: requestId() },
      },
      400,
    );
  }

  try {
    const places = await getGeocodingProvider().search(query, locale, {
      ...(proximity ? { proximity } : {}),
    });

    return jsonResponse({
      data: { places },
      meta: { requestId: requestId() },
    });
  } catch {
    return jsonResponse(
      {
        error: {
          code: "PROVIDER_ERROR",
          message: "La recherche de destination est temporairement indisponible.",
        },
        meta: { requestId: requestId() },
      },
      503,
    );
  }
}

function optionalProximity(params: URLSearchParams): Coordinates | undefined | null {
  const latitudeValue = params.get("latitude");
  const longitudeValue = params.get("longitude");
  if (latitudeValue === null && longitudeValue === null) {
    return undefined;
  }
  if (latitudeValue === null || longitudeValue === null) {
    return null;
  }
  if (latitudeValue.trim() === "" || longitudeValue.trim() === "") {
    return null;
  }
  const coordinates = {
    latitude: Number(latitudeValue),
    longitude: Number(longitudeValue),
  };
  return hasValidCoordinates(coordinates) ? coordinates : null;
}
