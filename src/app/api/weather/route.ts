import { z } from "zod";
import {
  WEATHER_DEFAULT_RADIUS_KM,
  clampRadiusKm,
  weatherSamplePoints,
} from "@/domain/weather/weather-grid";
import type { WeatherOverlay } from "@/domain/weather/types";
import { getWeatherProvider } from "@/infrastructure/weather/get-weather-provider";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const coordinateSchema = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .refine((value) => value !== "+" && value !== "-" && value !== ".")
    .transform((value) => Number(value))
    .refine((value) => Number.isFinite(value) && value >= min && value <= max);

const weatherQuerySchema = z.object({
  latitude: coordinateSchema(-90, 90),
  longitude: coordinateSchema(-180, 180),
  radiusKm: z
    .string()
    .trim()
    .optional()
    .transform((value) =>
      value === undefined || value === ""
        ? WEATHER_DEFAULT_RADIUS_KM
        : Number(value),
    )
    .refine((value) => Number.isFinite(value) && value > 0)
    .transform(clampRadiusKm),
});

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

function requestId(): string {
  return crypto.randomUUID();
}

/**
 * FR-043 — nappe météo autour d'un point. Le client ne parle jamais au
 * fournisseur directement : la clé éventuelle et le quota restent côté serveur
 * (BR-004, NFR-005).
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parsed = weatherQuerySchema.safeParse({
    latitude: url.searchParams.get("latitude") ?? "",
    longitude: url.searchParams.get("longitude") ?? "",
    radiusKm: url.searchParams.get("radiusKm") ?? undefined,
  });

  if (!parsed.success) {
    return jsonResponse(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Les coordonnées ou le rayon fournis sont invalides.",
        },
        meta: { requestId: requestId() },
      },
      400,
    );
  }

  const { latitude, longitude, radiusKm } = parsed.data;
  const center = { latitude, longitude };

  try {
    const samples = await getWeatherProvider().forecast(
      weatherSamplePoints(center, radiusKm),
    );
    if (samples.length === 0) {
      return jsonResponse(
        {
          error: {
            code: "PROVIDER_ERROR",
            message: "La météo n’a pas pu être obtenue pour ce secteur.",
          },
          meta: { requestId: requestId() },
        },
        503,
      );
    }
    const overlay: WeatherOverlay = {
      center,
      radiusKm,
      samples,
      observedAt: new Date().toISOString(),
    };
    return jsonResponse({
      data: { overlay },
      meta: { requestId: requestId() },
    });
  } catch {
    return jsonResponse(
      {
        error: {
          code: "PROVIDER_ERROR",
          message: "La météo n’a pas pu être obtenue pour ce secteur.",
        },
        meta: { requestId: requestId() },
      },
      503,
    );
  }
}
