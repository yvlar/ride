import { describe, expect, it } from "vitest";
import { CorridorRankingError } from "@/infrastructure/routing/rag/corridor-ranking-error";
import {
  canadaOnlyKnowledgeError,
  disconnectedKnowledgeError,
  emptyKnowledgeError,
  tooFarKnowledgeError,
  unpavedKnowledgeError,
} from "@/infrastructure/routing/routing-knowledge-error";
import type { ProviderRouteResult } from "@/infrastructure/routing/routing-provider";
import {
  errorFromExhaustedAttempts,
  primaryKnowledgeError,
  providerConfigurationError,
  rejectIfKnownUnpavedAvoided,
  rejectIfLeavesCanada,
  withKnowledgeConstraint,
} from "./routing-failure";

function rejected(reason: unknown): PromiseRejectedResult {
  return { status: "rejected", reason };
}

describe("primaryKnowledgeError (FR-021)", () => {
  it("returns undefined when no knowledge errors are present", () => {
    expect(
      primaryKnowledgeError([{ status: "fulfilled", value: null }]),
    ).toBeUndefined();
  });

  it("keeps a single knowledge error", () => {
    const error = emptyKnowledgeError();
    expect(primaryKnowledgeError([rejected(error)])).toBe(error);
  });

  it("prefers unpaved over too_far, empty, and disconnected", () => {
    const selected = primaryKnowledgeError([
      rejected(disconnectedKnowledgeError()),
      rejected(emptyKnowledgeError()),
      rejected(tooFarKnowledgeError()),
      rejected(unpavedKnowledgeError()),
    ]);
    expect(selected?.reason).toBe("unpaved");
  });

  it("prefers canada_only over unpaved (FR-028)", () => {
    const selected = primaryKnowledgeError([
      rejected(unpavedKnowledgeError()),
      rejected(canadaOnlyKnowledgeError()),
    ]);
    expect(selected?.reason).toBe("canada_only");
  });

  it("prefers too_far over empty and disconnected", () => {
    const selected = primaryKnowledgeError([
      rejected(disconnectedKnowledgeError()),
      rejected(tooFarKnowledgeError()),
      rejected(emptyKnowledgeError()),
    ]);
    expect(selected?.reason).toBe("too_far");
  });

  it("prefers empty over disconnected", () => {
    const selected = primaryKnowledgeError([
      rejected(disconnectedKnowledgeError()),
      rejected(emptyKnowledgeError()),
    ]);
    expect(selected?.reason).toBe("empty");
  });
});

describe("rejectIfKnownUnpavedAvoided (BR-007)", () => {
  const paved: ProviderRouteResult = {
    geometry: { type: "LineString", coordinates: [[0, 0], [1, 0]] },
    segments: [
      {
        id: "paved",
        geometry: { type: "LineString", coordinates: [[0, 0], [1, 0]] },
        distanceKm: 1,
        durationMinutes: 1,
        surface: "paved",
      },
    ],
    distanceKm: 1,
    durationMinutes: 1,
  };

  it("rejects a leaked known unpaved segment when avoidance is on", () => {
    const leaked: ProviderRouteResult = {
      ...paved,
      segments: [{ ...paved.segments[0]!, surface: "unpaved" }],
    };
    expect(() =>
      rejectIfKnownUnpavedAvoided(leaked, {
        avoidHighways: false,
        avoidUnpaved: true,
      }),
    ).toThrow(unpavedKnowledgeError().message);
  });

  it("allows known unpaved when avoidance is off", () => {
    const leaked: ProviderRouteResult = {
      ...paved,
      segments: [{ ...paved.segments[0]!, surface: "unpaved" }],
    };
    expect(
      rejectIfKnownUnpavedAvoided(leaked, {
        avoidHighways: false,
        avoidUnpaved: false,
      }),
    ).toBe(leaked);
  });
});

describe("rejectIfLeavesCanada (FR-028, BR-009)", () => {
  const canadian: ProviderRouteResult = {
    geometry: {
      type: "LineString",
      coordinates: [
        [-72.734, 45.403],
        [-72.5, 45.5],
      ],
    },
    segments: [
      {
        id: "qc",
        geometry: {
          type: "LineString",
          coordinates: [
            [-72.734, 45.403],
            [-72.5, 45.5],
          ],
        },
        distanceKm: 1,
        durationMinutes: 1,
      },
    ],
    distanceKm: 1,
    durationMinutes: 1,
  };

  it("rejects geometry that enters the United States when stayInCanada is on", () => {
    const leaked: ProviderRouteResult = {
      ...canadian,
      geometry: {
        type: "LineString",
        coordinates: [
          [-72.734, 45.403],
          [-83.0458, 42.3314],
        ],
      },
    };
    expect(() =>
      rejectIfLeavesCanada(leaked, {
        avoidHighways: false,
        avoidUnpaved: false,
        stayInCanada: true,
      }),
    ).toThrow(canadaOnlyKnowledgeError().message);
  });

  it("allows a United States crossing when the preference is off", () => {
    const leaked: ProviderRouteResult = {
      ...canadian,
      geometry: {
        type: "LineString",
        coordinates: [
          [-72.734, 45.403],
          [-83.0458, 42.3314],
        ],
      },
    };
    expect(
      rejectIfLeavesCanada(leaked, {
        avoidHighways: false,
        avoidUnpaved: false,
      }),
    ).toBe(leaked);
  });
});

describe("errorFromExhaustedAttempts (FR-021)", () => {
  it("maps mixed knowledge rejections to the unpaved message", () => {
    const error = errorFromExhaustedAttempts(
      [
        rejected(disconnectedKnowledgeError()),
        rejected(emptyKnowledgeError()),
        rejected(unpavedKnowledgeError()),
      ],
      { message: "fallback", suggestions: [] },
    );
    expect(error.code).toBe("NO_ROUTE_FOUND");
    expect(error.message).toMatch(/non pavées/);
  });

  it("maps a full provider outage to PROVIDER_ERROR", () => {
    const error = errorFromExhaustedAttempts(
      [rejected(new Error("timeout")), rejected(new Error("timeout"))],
      { message: "fallback", suggestions: [] },
    );
    expect(error.code).toBe("PROVIDER_ERROR");
  });

  it("maps a corridor ranking failure to PROVIDER_ERROR (FR-029)", () => {
    const error = errorFromExhaustedAttempts(
      [
        rejected(
          new CorridorRankingError(
            "La clé API du classement des corridors a été refusée (HTTP 401).",
          ),
        ),
        rejected(
          new CorridorRankingError(
            "La clé API du classement des corridors a été refusée (HTTP 401).",
          ),
        ),
      ],
      { message: "fallback", suggestions: [] },
    );
    expect(error.code).toBe("PROVIDER_ERROR");
    expect(error.message).toMatch(/HTTP 401/);
    expect(error.message).not.toMatch(/cartographie/);
    expect(error.suggestions.some((item) => item.includes("Vercel"))).toBe(
      true,
    );
  });

  it("keeps the unpaved FR-021 message when one attempt is a generic Error", () => {
    const error = errorFromExhaustedAttempts(
      [
        rejected(new Error("timeout")),
        rejected(emptyKnowledgeError()),
        rejected(unpavedKnowledgeError()),
      ],
      { message: "fallback", suggestions: [] },
    );
    expect(error.code).toBe("NO_ROUTE_FOUND");
    expect(error.message).toMatch(/non pavées/);
  });

  it("maps a fulfilled invalid candidate plus unpaved knowledge to the FR-021 message", () => {
    const error = errorFromExhaustedAttempts(
      [
        { status: "fulfilled", value: { isGeometricCircle: true } },
        rejected(emptyKnowledgeError()),
        rejected(unpavedKnowledgeError()),
      ],
      { message: "fallback", suggestions: [] },
    );
    expect(error.code).toBe("NO_ROUTE_FOUND");
    expect(error.message).toMatch(/non pavées/);
    expect(error.message).toMatch(/FR-021/);
  });

  it("recognizes a duck-typed knowledge error (NFR-005)", () => {
    const detached = {
      name: "RoutingKnowledgeError",
      reason: "unpaved",
      message: unpavedKnowledgeError().message,
      suggestions: ["Désactivez « éviter les routes non pavées »."],
    };
    const error = errorFromExhaustedAttempts(
      [rejected(detached), rejected(new Error("timeout"))],
      { message: "fallback", suggestions: [] },
    );
    expect(error.code).toBe("NO_ROUTE_FOUND");
    expect(error.message).toMatch(/non pavées/);
  });
});

describe("withKnowledgeConstraint (FR-021 + BR-001)", () => {
  const distanceError = {
    code: "DISTANCE_OUT_OF_TOLERANCE" as const,
    message:
      "Aucun trajet ne respecte ±10 % de 50.0 km (BR-001). Le meilleur candidat fait 400.0 km.",
    suggestions: ["Ajustez la distance cible."],
    bestCandidate: { distanceKm: 400 },
  };

  it("leaves a distance-only error unchanged", () => {
    expect(withKnowledgeConstraint(distanceError)).toEqual(distanceError);
  });

  it("appends the knowledge constraint without changing the distance code", () => {
    const knowledge = unpavedKnowledgeError();
    const combined = withKnowledgeConstraint(distanceError, knowledge);
    expect(combined.code).toBe("DISTANCE_OUT_OF_TOLERANCE");
    expect(combined.bestCandidate).toEqual({ distanceKm: 400 });
    expect(combined.message).toMatch(/BR-001/);
    expect(combined.message).toMatch(/FR-021/);
    expect(combined.message).toMatch(/non pavées/);
    expect(combined.suggestions).toContain(knowledge.suggestions[0]);
  });
});

describe("providerConfigurationError (FR-029)", () => {
  it("maps a missing ChatGPT key to PROVIDER_ERROR", () => {
    const error = providerConfigurationError(
      new Error("OPENAI_API_KEY est requis pour Corridors RAG."),
    );
    expect(error.code).toBe("PROVIDER_ERROR");
    expect(error.message).toMatch(/OPENAI_API_KEY/);
    expect(error.suggestions.some((item) => item.includes("serveur"))).toBe(
      true,
    );
    expect(error.suggestions.some((item) => item.includes("Vercel"))).toBe(
      true,
    );
  });

  it("maps a ChatGPT ranking error to PROVIDER_ERROR (FR-029)", () => {
    const error = providerConfigurationError(
      new CorridorRankingError(
        "Le classement des corridors a échoué (HTTP 429).",
      ),
    );
    expect(error.code).toBe("PROVIDER_ERROR");
    expect(error.message).toMatch(/HTTP 429/);
    expect(error.message).not.toMatch(/cartographie/);
    expect(error.suggestions.some((item) => item.includes("quota"))).toBe(true);
    expect(error.suggestions.some((item) => item.includes("redéployez"))).toBe(
      false,
    );
  });

  it("keeps the generic mapping outage for other setup failures", () => {
    const error = providerConfigurationError(new Error("boom"));
    expect(error.code).toBe("PROVIDER_ERROR");
    expect(error.message).toMatch(/cartographie/);
  });
});
