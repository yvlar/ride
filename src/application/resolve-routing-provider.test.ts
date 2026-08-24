import { describe, expect, it } from "vitest";
import { MockRoutingProvider } from "@/infrastructure/routing/mock-routing-provider";
import { RagRoutingProvider } from "@/infrastructure/routing/rag/rag-routing-provider";
import {
  isKnowledgeRoutingRequested,
  resolveRoutingProvider,
} from "./resolve-routing-provider";

describe("isKnowledgeRoutingRequested (FR-029)", () => {
  it("is false by default", () => {
    expect(isKnowledgeRoutingRequested(undefined)).toBe(false);
    expect(isKnowledgeRoutingRequested({ type: "loop" })).toBe(false);
    expect(isKnowledgeRoutingRequested({ useKnowledgeRouting: false })).toBe(
      false,
    );
  });

  it("reads the flag on the body and on a nested request", () => {
    expect(isKnowledgeRoutingRequested({ useKnowledgeRouting: true })).toBe(
      true,
    );
    expect(
      isKnowledgeRoutingRequested({
        request: { type: "loop", useKnowledgeRouting: true },
      }),
    ).toBe(true);
  });
});

describe("resolveRoutingProvider (FR-029, BR-004)", () => {
  it("keeps an injected provider even when the flag is on", () => {
    const injected = new MockRoutingProvider();
    expect(
      resolveRoutingProvider({ useKnowledgeRouting: true }, injected),
    ).toBe(injected);
  });

  it("selects the knowledge adapter when the flag is on", () => {
    const provider = resolveRoutingProvider({
      type: "loop",
      useKnowledgeRouting: true,
    });
    expect(provider).toBeInstanceOf(RagRoutingProvider);
  });

  it("keeps the environment provider when the flag is absent", () => {
    const provider = resolveRoutingProvider({ type: "loop" });
    expect(provider).toBeInstanceOf(MockRoutingProvider);
  });
});
