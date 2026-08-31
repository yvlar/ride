import { snapGpxWaypoints } from "@/application/snap-gpx-waypoints";
import type { RideGenerationError } from "@/domain/ride/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BODY_BYTES = 65_536;
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return errorResponse(
      requestId,
      {
        code: "VALIDATION_ERROR",
        message: "La requête de route GPX est trop volumineuse.",
        suggestions: ["Envoyez uniquement les points de la route, dans l’ordre."],
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
          message: "La requête de route GPX est trop volumineuse.",
          suggestions: ["Envoyez uniquement les points de la route, dans l’ordre."],
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
        suggestions: ["Envoyez waypoints dans l’ordre du fichier GPX (FR-039)."],
      },
      400,
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("waypoints" in body) ||
    !Array.isArray((body as { waypoints: unknown }).waypoints)
  ) {
    return errorResponse(
      requestId,
      {
        code: "VALIDATION_ERROR",
        message: "La route GPX exige une liste ordonnée de points.",
        suggestions: ["Conservez l’ordre des rtept du fichier."],
      },
      400,
    );
  }

  const payload = body as {
    waypoints: { latitude: number; longitude: number }[];
    style?: "curvy" | "scenic" | "touring" | "fastest";
    preferences?: {
      avoidHighways: boolean;
      avoidUnpaved: boolean;
      stayInCanada?: boolean;
    };
  };

  try {
    const result = await snapGpxWaypoints(
      {
        waypoints: payload.waypoints,
        style: payload.style,
        preferences: payload.preferences,
      },
      undefined,
      { signal: request.signal },
    );
    if (!result.ok) {
      const status =
        result.error.code === "VALIDATION_ERROR" ||
        result.error.code === "GPX_INVALID"
          ? 400
          : result.error.code === "PROVIDER_ERROR" ||
              result.error.code === "ROUTING_UNAVAILABLE"
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
          "Le moteur de routage n’a pas pu relier les points de la route GPX.",
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
