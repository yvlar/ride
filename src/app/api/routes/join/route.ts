import { joinRoute } from "@/application/join-route";
import type { RideGenerationError } from "@/domain/ride/types";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const MAX_BODY_BYTES = 8_192;
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return errorResponse(
      requestId,
      {
        code: "VALIDATION_ERROR",
        message: "La requête de raccordement est trop volumineuse.",
        suggestions: ["Envoyez uniquement le départ et le point d’entrée."],
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
          message: "La requête de raccordement est trop volumineuse.",
          suggestions: ["Envoyez uniquement le départ et le point d’entrée."],
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
        suggestions: ["Envoyez start et destination (FR-039)."],
      },
      400,
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("start" in body) ||
    !("destination" in body)
  ) {
    return errorResponse(
      requestId,
      {
        code: "VALIDATION_ERROR",
        message: "Le raccordement exige un départ et un point d’entrée.",
        suggestions: ["Renvoyez la position actuelle et le point projeté sur le GPX."],
      },
      400,
    );
  }

  const payload = body as {
    start: { latitude: number; longitude: number };
    destination: { latitude: number; longitude: number };
    style?: "curvy" | "scenic" | "touring";
    preferences?: {
      avoidHighways: boolean;
      avoidUnpaved: boolean;
      stayInCanada?: boolean;
    };
  };

  try {
    const result = await joinRoute(
      {
        start: payload.start,
        destination: payload.destination,
        style: payload.style,
        preferences: payload.preferences,
      },
      undefined,
      { signal: request.signal },
    );
    if (!result.ok) {
      const status =
        result.error.code === "VALIDATION_ERROR"
          ? 400
          : result.error.code === "STALE_RECALCULATE"
            ? 409
            : result.error.code === "PROVIDER_ERROR"
              ? 503
              : 422;
      return errorResponse(requestId, result.error, status);
    }
    return Response.json(
      { data: { route: result.route }, meta: { requestId } },
      { headers: NO_STORE },
    );
  } catch {
    return errorResponse(
      requestId,
      {
        code: "PROVIDER_ERROR",
        message:
          "Le raccordement vers le trajet GPX a échoué. Le tracé importé reste affiché.",
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
    { error, meta: { requestId } },
    { status, headers: NO_STORE },
  );
}
