import { isInUnitedStates } from "@/domain/geo/united-states";
import type { Coordinates } from "@/domain/geo/types";
import { usesKnownUnpaved } from "@/domain/ride/constraints";
import { routeEntersUnitedStates, stayInCanadaEnabled } from "@/domain/ride/canada";
import type { RideGenerationError, RoutePreferences } from "@/domain/ride/types";
import {
  isCorridorRankingError,
  type CorridorRankingError,
} from "@/infrastructure/routing/rag/corridor-ranking-error";
import {
  canadaOnlyKnowledgeError,
  isRoutingKnowledgeError,
  RoutingKnowledgeError,
  unpavedKnowledgeError,
  type KnowledgeMissReason,
} from "@/infrastructure/routing/routing-knowledge-error";
import type { ProviderRouteResult } from "@/infrastructure/routing/routing-provider";

const KNOWLEDGE_REASON_PRIORITY: Record<KnowledgeMissReason, number> = {
  canada_only: 0,
  unpaved: 1,
  too_far: 2,
  empty: 3,
  disconnected: 4,
};

/** BR-007 — known unpaved segments are rejected after the provider returns. */
export function rejectIfKnownUnpavedAvoided(
  result: ProviderRouteResult,
  preferences: RoutePreferences | undefined,
): ProviderRouteResult {
  if (preferences?.avoidUnpaved && usesKnownUnpaved(result.segments)) {
    throw unpavedKnowledgeError();
  }
  return result;
}

/** BR-009 — United States geometry is rejected after the provider returns. */
export function rejectIfLeavesCanada(
  result: ProviderRouteResult,
  preferences: RoutePreferences | undefined,
): ProviderRouteResult {
  if (
    stayInCanadaEnabled(preferences?.stayInCanada) &&
    routeEntersUnitedStates(result)
  ) {
    throw canadaOnlyKnowledgeError();
  }
  return result;
}

export function applyHardRoutePreferences(
  result: ProviderRouteResult,
  preferences: RoutePreferences | undefined,
): ProviderRouteResult {
  return rejectIfLeavesCanada(
    rejectIfKnownUnpavedAvoided(result, preferences),
    preferences,
  );
}

export function stayInCanadaEndpointError(
  start: Coordinates,
  destination: Coordinates | undefined,
  stayInCanada: boolean | undefined,
): RideGenerationError | undefined {
  if (!stayInCanadaEnabled(stayInCanada)) {
    return undefined;
  }
  if (isInUnitedStates(start)) {
    return knowledgeUnavailableError(
      new RoutingKnowledgeError(
        "canada_only",
        "Le point de départ est aux États-Unis. L’option « Canada seulement » exige un départ au Canada (FR-028, FR-021).",
        [
          "Choisissez un point de départ au Canada.",
          "Désactivez « Canada seulement » si vous partez des États-Unis.",
        ],
      ),
    );
  }
  if (destination && isInUnitedStates(destination)) {
    return knowledgeUnavailableError(
      new RoutingKnowledgeError(
        "canada_only",
        "La destination est aux États-Unis. L’option « Canada seulement » refuse de traverser la frontière (FR-028, FR-021).",
        [
          "Choisissez une destination au Canada.",
          "Désactivez « Canada seulement » pour un trajet vers les États-Unis.",
        ],
      ),
    );
  }
  return undefined;
}

export function providerConfigurationError(
  error: unknown,
): RideGenerationError {
  if (isCorridorRankingError(error)) {
    return rankingProviderError(error);
  }

  const message = error instanceof Error ? error.message : "";
  if (message.includes("OPENAI_API_KEY")) {
    return {
      code: "PROVIDER_ERROR",
      message:
        "La clé API du classement des corridors est absente. Définissez OPENAI_API_KEY côté serveur.",
      suggestions: rankingKeySuggestions(),
    };
  }

  return {
    code: "PROVIDER_ERROR",
    message:
      "Le service de cartographie ne répond pas. Réessayez dans quelques instants.",
    suggestions: ["Vérifiez ROUTING_PROVIDER et ROUTING_API_BASE_URL."],
  };
}

export function rankingProviderError(
  error: CorridorRankingError,
): RideGenerationError {
  return {
    code: "PROVIDER_ERROR",
    message: error.message,
    suggestions: rankingKeySuggestions(),
  };
}

function rankingKeySuggestions(): string[] {
  return [
    "Vérifiez OPENAI_API_KEY sur le serveur (Vercel Preview et Production), puis redéployez.",
    "N’exposez jamais cette clé dans le navigateur.",
  ];
}

export function errorFromExhaustedAttempts(
  settled: PromiseSettledResult<unknown>[],
  fallback: Pick<RideGenerationError, "message" | "suggestions">,
): RideGenerationError {
  const everyAttemptFailed =
    settled.length > 0 &&
    settled.every((result) => result.status === "rejected");
  const knowledge = primaryKnowledgeError(settled);

  if (knowledge) {
    return knowledgeUnavailableError(knowledge);
  }

  if (everyAttemptFailed) {
    const ranking = primaryRankingError(settled);
    if (ranking) {
      return rankingProviderError(ranking);
    }
    return {
      code: "PROVIDER_ERROR",
      message:
        "Le service de cartographie ne répond pas. Réessayez dans quelques instants.",
      suggestions: ["Réessayez dans quelques instants."],
    };
  }

  return {
    code: "NO_ROUTE_FOUND",
    message: fallback.message,
    suggestions: fallback.suggestions,
  };
}

export function knowledgeUnavailableError(
  error?: RoutingKnowledgeError,
): RideGenerationError {
  if (error) {
    return {
      code: "NO_ROUTE_FOUND",
      message: error.message,
      suggestions: error.suggestions,
    };
  }

  return {
    code: "NO_ROUTE_FOUND",
    message:
      "Aucun corridor connu n’a été retrouvé pour cette demande (FR-021).",
    suggestions: [
      "Essayez un autre départ ou une autre destination.",
      "Relâchez les préférences d’évitement si elles sont actives.",
    ],
  };
}

/** BR-001 + FR-021 — keep the distance code and append the knowledge constraint. */
export function withKnowledgeConstraint(
  error: RideGenerationError,
  knowledge?: RoutingKnowledgeError,
): RideGenerationError {
  if (!knowledge) {
    return error;
  }

  const suggestions = [...error.suggestions];
  for (const suggestion of knowledge.suggestions) {
    if (!suggestions.includes(suggestion)) {
      suggestions.push(suggestion);
    }
  }

  return {
    ...error,
    message: `${error.message} ${knowledge.message}`,
    suggestions,
  };
}

export function primaryKnowledgeError(
  settled: PromiseSettledResult<unknown>[],
): RoutingKnowledgeError | undefined {
  let selected: RoutingKnowledgeError | undefined;
  for (const result of settled) {
    if (
      result.status !== "rejected" ||
      !isRoutingKnowledgeError(result.reason)
    ) {
      continue;
    }
    if (
      !selected ||
      KNOWLEDGE_REASON_PRIORITY[result.reason.reason] <
        KNOWLEDGE_REASON_PRIORITY[selected.reason]
    ) {
      selected = result.reason;
    }
  }
  return selected;
}

export function primaryRankingError(
  settled: PromiseSettledResult<unknown>[],
): CorridorRankingError | undefined {
  for (const result of settled) {
    if (result.status === "rejected" && isCorridorRankingError(result.reason)) {
      return result.reason;
    }
  }
  return undefined;
}
