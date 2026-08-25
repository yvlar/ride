import { describe, expect, it } from "vitest";
import {
  isAiWebGenerationRequested,
  readOriginAccuracyMeters,
  readPreviousRouteSignature,
  readReturnToStart,
} from "./ai-web-generation";

describe("ai-web-generation transport flags (FR-034)", () => {
  it("reads the flag from the request or regenerate envelope", () => {
    expect(isAiWebGenerationRequested(undefined)).toBe(false);
    expect(isAiWebGenerationRequested({ type: "loop" })).toBe(false);
    expect(isAiWebGenerationRequested({ useAiWebGeneration: true })).toBe(true);
    expect(
      isAiWebGenerationRequested({
        request: { type: "loop", useAiWebGeneration: true },
      }),
    ).toBe(true);
  });

  it("reads origin accuracy and the previous signature", () => {
    expect(readOriginAccuracyMeters({ originAccuracyMeters: 8 })).toBe(8);
    expect(
      readOriginAccuracyMeters({
        request: { originAccuracyMeters: 12 },
      }),
    ).toBe(12);
    expect(readOriginAccuracyMeters({ originAccuracyMeters: -1 })).toBe(null);
    expect(
      readPreviousRouteSignature({ previousRouteSignature: "route-1:3:ab" }),
    ).toBe("route-1:3:ab");
  });

  it("defaults returnToStart to a loop and honors an explicit false (FR-034)", () => {
    expect(readReturnToStart({ type: "loop" })).toBe(true);
    expect(readReturnToStart({ returnToStart: true })).toBe(true);
    expect(readReturnToStart({ returnToStart: false })).toBe(false);
    expect(
      readReturnToStart({ request: { type: "loop", returnToStart: false } }),
    ).toBe(false);
  });
});
