import { z } from "zod";
import { observeWeather } from "@/application/observe-weather";
import { weatherEscapeAdvice } from "@/domain/weather/escape-direction";
import {
  DEFAULT_WEATHER_RADIUS_KM,
  clampRadiusKm,
} from "@/domain/weather/sample-grid";
import {
  getRadarProvider,
  getWeatherProvider,
} from "@/infrastructure/weather/get-weather-provider";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const coordinateSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => value !== "+" && value !== "-" && value !== ".")
  .transform((value) => Number(value))
  .refine((value) => Number.isFinite(value));

const centerSchema = z.object({
  latitude: coordinateSchema.refine((value) => value >= -90 && value <= 90),
  longitude: coordinateSchema.refine((value) => value >= -180 && value <= 180),
});

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

function requestId(): string {
  return crypto.randomUUID();
}

/** FR-043 — the sky around a point, plus the direction advice drawn from it. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parsed = centerSchema.safeParse({
    latitude: url.searchParams.get("latitude") ?? "",
    longitude: url.searchParams.get("longitude") ?? "",
  });

  if (!parsed.success) {
    return jsonResponse(
      {
        error: {
          code: "INVALID_COORDINATES",
          message: "Indiquez une latitude et une longitude valides.",
        },
        meta: { requestId: requestId() },
      },
      400,
    );
  }

  const rawRadius = url.searchParams.get("radiusKm");
  const radiusKm = rawRadius
    ? clampRadiusKm(Number(rawRadius))
    : DEFAULT_WEATHER_RADIUS_KM;

  try {
    const observation = await observeWeather({
      center: parsed.data,
      radiusKm,
      weather: getWeatherProvider(),
      radar: getRadarProvider(),
      onRadarFailure: (error) => {
        console.error("[weather] imagerie radar indisponible", error);
      },
    });

    return jsonResponse({
      data: {
        ...observation,
        // Computed here so the map, the panel and any future voice prompt all
        // read the same sentence (FR-043).
        advice: weatherEscapeAdvice(observation.field),
      },
      meta: { requestId: requestId() },
    });
  } catch {
    return jsonResponse(
      {
        error: {
          code: "PROVIDER_ERROR",
          message: "Les données météo ne sont pas disponibles.",
        },
        meta: { requestId: requestId() },
      },
      503,
    );
  }
}
