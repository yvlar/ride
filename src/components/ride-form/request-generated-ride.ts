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

export async function requestGeneratedRide(
  request: GenerateRideRequest,
): Promise<GenerateRideResult> {
  let response: Response;
  try {
    response = await fetch("/api/routes/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
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
  return isRideGenerationError(value.error);
}

function isSuccessBody(value: unknown): value is GenerateSuccessBody {
  if (typeof value !== "object" || value === null || !("data" in value)) {
    return false;
  }
  const data = value.data;
  if (typeof data !== "object" || data === null || !("route" in data)) {
    return false;
  }
  return isGeneratedRideRoute(data.route);
}

function isRideGenerationError(value: unknown): value is RideGenerationError {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const error = value as Record<string, unknown>;
  return (
    typeof error.code === "string" &&
    typeof error.message === "string" &&
    Array.isArray(error.suggestions) &&
    error.suggestions.every((suggestion) => typeof suggestion === "string")
  );
}

function isGeneratedRideRoute(value: unknown): value is GeneratedRideRoute {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const route = value as Record<string, unknown>;
  return (
    (route.type === "loop" ||
      route.type === "destination" ||
      route.type === "round_trip") &&
    typeof route.distanceKm === "number" &&
    Number.isFinite(route.distanceKm) &&
    typeof route.durationMinutes === "number" &&
    Number.isFinite(route.durationMinutes) &&
    typeof route.geometry === "object" &&
    route.geometry !== null
  );
}
