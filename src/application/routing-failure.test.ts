import { describe, expect, it } from "vitest";
import {
  disconnectedKnowledgeError,
  emptyKnowledgeError,
  tooFarKnowledgeError,
  unpavedKnowledgeError,
} from "@/infrastructure/routing/routing-knowledge-error";
import type { ProviderRouteResult } from "@/infrastructure/routing/routing-provider";
import {
  errorFromExhaustedAttempts,
  primaryKnowledgeError,
  rejectIfKnownUnpavedAvoided,
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
