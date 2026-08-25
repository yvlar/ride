import { generateDestinationRide } from "@/application/generate-destination-ride";
import { generateDescribedRide } from "@/application/generate-described-ride";
import { generateLoopRide } from "@/application/generate-loop-ride";
import { generateRoundTripRide } from "@/application/generate-round-trip-ride";
import { unsupportedRideTypeMessage } from "@/domain/ride/schemas";
import type {
  GenerateRideResult,
  RideGenerationOptions,
} from "@/domain/ride/types";
import { isAiWebGenerationRequested } from "@/application/ai-web-generation";
import { resolveRoutingProvider } from "@/application/resolve-routing-provider";
import type { RoutingProvider } from "@/infrastructure/routing/routing-provider";
import { providerConfigurationError } from "./routing-failure";

export type { GenerateRideResult };

export async function generateRide(
  input: unknown,
  routingProvider?: RoutingProvider,
  options?: RideGenerationOptions,
): Promise<GenerateRideResult> {
  if (isAiWebGenerationRequested(input)) {
    return generateDescribedRide(input, routingProvider, options);
  }

  let provider: RoutingProvider;
  try {
    provider = resolveRoutingProvider(input, routingProvider);
  } catch (error) {
    return { ok: false, error: providerConfigurationError(error) };
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
