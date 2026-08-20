import { getGeocodingProvider } from "@/infrastructure/geocoding/get-geocoding-provider";
import { MOCK_GEOCODING_MIN_QUERY_LENGTH } from "@/infrastructure/geocoding/mock-geocoding-provider";

function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return Response.json(body, { status });
}

function requestId(): string {
  return crypto.randomUUID();
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
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

  const places = await getGeocodingProvider().search(query, locale);

  return jsonResponse({
    data: { places },
    meta: { requestId: requestId() },
  });
}
