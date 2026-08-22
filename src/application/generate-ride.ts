import { generateDestinationRide } from "@/application/generate-destination-ride";
import { generateLoopRide } from "@/application/generate-loop-ride";
import { generateRoundTripRide } from "@/application/generate-round-trip-ride";
import { unsupportedRideTypeMessage } from "@/domain/ride/schemas";
import type {
  GenerateRideResult,
  RideGenerationOptions,
} from "@/domain/ride/types";
import { createRoutingProvider } from "@/infrastructure/routing/create-routing-provider";
import type { RoutingProvider } from "@/infrastructure/routing/routing-provider";

export type { GenerateRideResult };

export async function generateRide(
  input: unknown,
  routingProvider?: RoutingProvider,
  options?: RideGenerationOptions,
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
            "Vérifiez ROUTING_PROVIDER=ai-rag ou ROUTING_PROVIDER=mock.",
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
    return generateLoopRide(input, provider, options);
  }

  if (type === "destination") {
    return generateDestinationRide(input, provider, options);
  }

  if (type === "round_trip") {
    return generateRoundTripRide(input, provider, options);
  }

  return {
    ok: false,
    error: {
      code: "UNSUPPORTED_RIDE_TYPE",
      message: unsupportedRideTypeMessage(type),
      suggestions: [
        'Utilisez type: "loop", type: "destination" ou type: "round_trip".',
      ],
    },
  };
}
