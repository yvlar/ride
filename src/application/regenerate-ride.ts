import { generateRide } from "@/application/generate-ride";
import { regenerateRideEnvelopeSchema } from "@/domain/ride/schemas";
import type { GenerateRideResult } from "@/domain/ride/types";
import { createRoutingProvider } from "@/infrastructure/routing/create-routing-provider";
import type { RoutingProvider } from "@/infrastructure/routing/routing-provider";

export async function regenerateRide(
  input: unknown,
  routingProvider?: RoutingProvider,
): Promise<GenerateRideResult> {
  let provider = routingProvider;
  if (!provider) {
    try {
      provider = createRoutingProvider();
    } catch {
      return {
        ok: false,
        error: {
          code: "PROVIDER_ERROR",
          message:
            "Le service de cartographie ne répond pas. Réessayez dans quelques instants.",
          suggestions: [
            "Vérifiez ROUTING_PROVIDER et ROUTING_API_BASE_URL.",
          ],
        },
      };
    }
  }

  const parsed = regenerateRideEnvelopeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map((issue) => issue.message).join(" "),
        suggestions: [
          "Envoyez request (mêmes critères) et previousRoute.geometry du trajet précédent (FR-012).",
        ],
      },
    };
  }

  return generateRide(parsed.data.request, provider, {
    previousGeometry: parsed.data.previousRoute.geometry,
  });
}
