import { z } from "zod";
import { rankPlaces } from "@/domain/search/place-ranking";
import { PLACE_SEARCH_MIN_QUERY_LENGTH } from "@/domain/search/place-search";
import { getGeocodingProvider } from "@/infrastructure/geocoding/get-geocoding-provider";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const coordinateSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => value !== "+" && value !== "-" && value !== ".")
  .transform((value) => Number(value))
  .refine((value) => Number.isFinite(value));

const proximitySchema = z
  .object({
    latitude: coordinateSchema.refine((value) => value >= -90 && value <= 90),
    longitude: coordinateSchema.refine(
      (value) => value >= -180 && value <= 180,
    ),
  })
  .nullable();

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

function requestId(): string {
  return crypto.randomUUID();
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const locale = url.searchParams.get("locale")?.trim() || "fr";

  if (query.length < PLACE_SEARCH_MIN_QUERY_LENGTH) {
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

  const latitude = url.searchParams.get("latitude");
  const longitude = url.searchParams.get("longitude");
  // Proximity is a nicety: a malformed pair is ignored rather than failing the
  // search (FR-032).
  const parsedProximity =
    latitude && longitude
      ? proximitySchema.safeParse({ latitude, longitude })
      : null;
  const proximity = parsedProximity?.success ? parsedProximity.data : null;

  try {
    const places = await getGeocodingProvider().search(query, locale, {
      proximity,
    });

    return jsonResponse({
      // Québec and Canada first, then nearest — never a hard filter (FR-032).
      data: { places: rankPlaces(places, { proximity }) },
      meta: { requestId: requestId() },
    });
  } catch {
    return jsonResponse(
      {
        error: {
          code: "PROVIDER_ERROR",
          message: "La recherche de lieu a échoué.",
        },
        meta: { requestId: requestId() },
      },
      503,
    );
  }
}
