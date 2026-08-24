import type {
  GenerateRideRequest,
  GenerateRideResult,
  GeneratedRideRoute,
  RideGenerationError,
} from "@/domain/ride/types";

const PROVIDER_UNAVAILABLE: RideGenerationError = {
  code: "PROVIDER_ERROR",
  message:
    "Le service de cartographie ne répond pas. Réessayez dans quelques instants.",
  suggestions: ["Réessayez dans quelques instants."],
};

type GenerateSuccessBody = {
  data: {
    route: GeneratedRideRoute;
  };
};

type GenerateErrorBody = {
  error: RideGenerationError;
};

export type GenerateRideClientOptions = {
  useKnowledgeRouting?: boolean;
  signal?: AbortSignal;
};

export async function requestRegeneratedRide(
  request: GenerateRideRequest,
  previousRoute: GeneratedRideRoute,
  options?: GenerateRideClientOptions,
): Promise<GenerateRideResult> {
  const payload = {
    request:
      options?.useKnowledgeRouting === true
        ? { ...request, useKnowledgeRouting: true }
        : request,
    previousRoute: { geometry: previousRoute.geometry },
  };

  let response: Response;
  try {
    response = await fetch("/api/routes/regenerate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: options?.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        ok: false,
        error: {
          code: "STALE_RECALCULATE",
          message: "Régénération annulée.",
          suggestions: [],
        },
      };
    }
    return { ok: false, error: PROVIDER_UNAVAILABLE };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: PROVIDER_UNAVAILABLE };
  }

  if (isErrorBody(body)) {
    return { ok: false, error: body.error };
  }
  if (isSuccessBody(body)) {
    return { ok: true, route: body.data.route };
  }
  return { ok: false, error: PROVIDER_UNAVAILABLE };
}

function isErrorBody(value: unknown): value is GenerateErrorBody {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }
  const error = (value as { error: unknown }).error;
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const record = error as Record<string, unknown>;
  return (
    typeof record.code === "string" &&
    typeof record.message === "string" &&
    Array.isArray(record.suggestions)
  );
}

function isSuccessBody(value: unknown): value is GenerateSuccessBody {
  if (typeof value !== "object" || value === null || !("data" in value)) {
    return false;
  }
  const data = (value as { data: unknown }).data;
  if (typeof data !== "object" || data === null || !("route" in data)) {
    return false;
  }
  const route = (data as { route: unknown }).route;
  if (typeof route !== "object" || route === null) {
    return false;
  }
  const record = route as Record<string, unknown>;
  return (
    (record.type === "loop" ||
      record.type === "destination" ||
      record.type === "round_trip") &&
    typeof record.distanceKm === "number"
  );
}
