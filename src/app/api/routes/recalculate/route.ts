import { recalculateRoute } from "@/application/recalculate-route";
import type { RideGenerationError } from "@/domain/ride/types";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const MAX_BODY_BYTES = 262_144;
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return errorResponse(
      requestId,
      {
        code: "VALIDATION_ERROR",
        message: "La requête de recalcul est trop volumineuse.",
        suggestions: ["Envoyez uniquement le trajet courant et la position actuelle."],
      },
      400,
    );
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return errorResponse(
        requestId,
        {
          code: "VALIDATION_ERROR",
          message: "La requête de recalcul est trop volumineuse.",
          suggestions: ["Envoyez uniquement le trajet courant et la position actuelle."],
        },
        400,
      );
    }
    body = JSON.parse(text) as unknown;
  } catch {
    return errorResponse(
      requestId,
      {
        code: "VALIDATION_ERROR",
        message: "Le corps de la requête doit être un JSON valide.",
        suggestions: [
          "Envoyez currentPosition, progressKm, request et originalRoute (FR-026).",
        ],
      },
      400,
    );
  }

  try {
    const result = await recalculateRoute(body, undefined, {
      signal: request.signal,
    });
    if (!result.ok) {
      const status =
        result.error.code === "VALIDATION_ERROR" ||
        result.error.code === "UNSUPPORTED_RIDE_TYPE"
          ? 400
          : result.error.code === "STALE_RECALCULATE"
            ? 409
            : result.error.code === "PROVIDER_ERROR"
              ? 503
              : 422;
      return errorResponse(requestId, result.error, status);
    }

    return Response.json(
      {
        data: { route: result.route },
        meta: { requestId },
      },
      { headers: NO_STORE },
    );
  } catch {
    return errorResponse(
      requestId,
      {
        code: "PROVIDER_ERROR",
        message:
          "Le recalcul du trajet a échoué. L’itinéraire actuel reste affiché.",
        suggestions: ["Continuez sur le trajet affiché ou réessayez."],
      },
      503,
    );
  }
}

function errorResponse(
  requestId: string,
  error: RideGenerationError,
  status: number,
) {
  return Response.json(
    { error, meta: { requestId } },
    { status, headers: NO_STORE },
  );
}
