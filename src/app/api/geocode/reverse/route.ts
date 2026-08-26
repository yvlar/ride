import { z } from "zod";
import { getGeocodingProvider } from "@/infrastructure/geocoding/get-geocoding-provider";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const localeSchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .pipe(z.string().regex(/^[a-z]{2}(?:-[a-z]{2})?$/));

const reverseQuerySchema = z.object({
  latitude: z
    .string()
    .trim()
    .min(1)
    .refine((value) => value !== "+" && value !== "-" && value !== ".")
    .transform((value) => Number(value))
    .refine((value) => Number.isFinite(value) && value >= -90 && value <= 90),
  longitude: z
    .string()
    .trim()
    .min(1)
    .refine((value) => value !== "+" && value !== "-" && value !== ".")
    .transform((value) => Number(value))
    .refine((value) => Number.isFinite(value) && value >= -180 && value <= 180),
  locale: localeSchema.default("fr"),
});

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

function requestId(): string {
  return crypto.randomUUID();
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parsed = reverseQuerySchema.safeParse({
    latitude: url.searchParams.get("latitude") ?? "",
    longitude: url.searchParams.get("longitude") ?? "",
    locale: url.searchParams.get("locale") || undefined,
  });

  if (!parsed.success) {
    return jsonResponse(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Les coordonnées ou la langue fournies sont invalides.",
        },
        meta: { requestId: requestId() },
      },
      400,
    );
  }

  const { latitude, longitude, locale } = parsed.data;
  const coordinates = { latitude, longitude };

  try {
    const place = await getGeocodingProvider().reverse(coordinates, locale);
    return jsonResponse({
      // The whole Place is returned: the map picker needs the municipality,
      // region and kind to describe the point it just dropped (FR-038).
      data: { place: { ...place, coordinates } },
      meta: { requestId: requestId() },
    });
  } catch {
    return jsonResponse(
      {
        error: {
          code: "PROVIDER_ERROR",
          message: "L’adresse n’a pas pu être déterminée.",
        },
        meta: { requestId: requestId() },
      },
      503,
    );
  }
}
