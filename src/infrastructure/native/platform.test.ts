import { describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => false,
  },
}));

describe("isNativeCapacitorPlatform (NFR-007, FR-027)", () => {
  it("is false in the Vitest / browser test runtime", async () => {
    const { isNativeCapacitorPlatform } = await import("./platform");
    expect(isNativeCapacitorPlatform()).toBe(false);
  });
});
