import { generateLoopRide } from "@/application/generate-loop-ride";
import type { RideGenerationError } from "@/domain/ride/types";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const MAX_BODY_BYTES = 32_768;
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return errorResponse(
      requestId,
      {
        code: "VALIDATION_ERROR",
        message: "La requête est trop volumineuse.",
        suggestions: ["Envoyez uniquement les champs de la demande de boucle."],
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
          message: "La requête est trop volumineuse.",
          suggestions: ["Envoyez uniquement les champs de la demande de boucle."],
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
        suggestions: ['Envoyez un objet JSON avec type: "loop".'],
      },
      400,
    );
  }

  try {
    const result = await generateLoopRide(body);
    if (!result.ok) {
      const status =
        result.error.code === "VALIDATION_ERROR" ||
        result.error.code === "UNSUPPORTED_RIDE_TYPE"
          ? 400
          : result.error.code === "PROVIDER_ERROR"
            ? 503
            : 422;
      return errorResponse(requestId, result.error, status);
    }

    return Response.json(
      {
        data: {
          route: result.route,
        },
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
          "Le service de cartographie ne répond pas. Réessayez dans quelques instants.",
        suggestions: ["Réessayez dans quelques instants."],
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
    {
      error,
      meta: { requestId },
    },
    { status, headers: NO_STORE },
  );
}
