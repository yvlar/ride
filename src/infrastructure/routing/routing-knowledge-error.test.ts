import { describe, expect, it } from "vitest";
import {
  isRoutingKnowledgeError,
  unpavedKnowledgeError,
} from "./routing-knowledge-error";

describe("isRoutingKnowledgeError (NFR-005)", () => {
  it("accepts a class instance", () => {
    expect(isRoutingKnowledgeError(unpavedKnowledgeError())).toBe(true);
  });

  it("accepts a duck-typed knowledge miss", () => {
    expect(
      isRoutingKnowledgeError({
        name: "RoutingKnowledgeError",
        reason: "empty",
        message: "Aucun corridor connu.",
        suggestions: ["Essayez un autre départ."],
      }),
    ).toBe(true);
  });

  it("rejects a generic Error and a partial object", () => {
    expect(isRoutingKnowledgeError(new Error("timeout"))).toBe(false);
    expect(isRoutingKnowledgeError({ reason: "unpaved" })).toBe(false);
    expect(
      isRoutingKnowledgeError({
        name: "RoutingKnowledgeError",
        reason: "not-a-reason",
        message: "x",
        suggestions: [],
      }),
    ).toBe(false);
  });
});
