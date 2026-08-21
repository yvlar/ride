import { generateDestinationRide } from "@/application/generate-destination-ride";
import { generateLoopRide } from "@/application/generate-loop-ride";
import { unsupportedRideTypeMessage } from "@/domain/ride/schemas";
import type { GeneratedRideRoute, RideGenerationError } from "@/domain/ride/types";
import { createRoutingProvider } from "@/infrastructure/routing/create-routing-provider";
import type { RoutingProvider } from "@/infrastructure/routing/routing-provider";

export type GenerateRideResult =
  | { ok: true; route: GeneratedRideRoute }
  | { ok: false; error: RideGenerationError };

export async function generateRide(
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
            "Vérifiez ROUTING_PROVIDER=mock tant qu’aucun fournisseur réel n’est branché.",
          ],
        },
      };
    }
  }

  const type =
    typeof input === "object" && input !== null && "type" in input
      ? (input as { type: unknown }).type
      : undefined;

  if (type === "loop") {
    return generateLoopRide(input, provider);
  }

  if (type === "destination") {
    return generateDestinationRide(input, provider);
  }

  return {
    ok: false,
    error: {
      code: "UNSUPPORTED_RIDE_TYPE",
      message: unsupportedRideTypeMessage(type),
      suggestions: [
        'Utilisez type: "loop" ou type: "destination".',
      ],
    },
  };
}
