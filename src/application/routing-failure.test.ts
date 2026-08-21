import { describe, expect, it } from "vitest";
import {
  disconnectedKnowledgeError,
  emptyKnowledgeError,
  tooFarKnowledgeError,
  unpavedKnowledgeError,
} from "@/infrastructure/routing/rag/routing-knowledge-error";
import { primaryKnowledgeError } from "./routing-failure";

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
