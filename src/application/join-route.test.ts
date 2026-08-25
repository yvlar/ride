import { describe, expect, it } from "vitest";
import { joinRoute } from "./join-route";
import { MockRoutingProvider } from "@/infrastructure/routing/mock-routing-provider";

describe("joinRoute (FR-039, BR-010)", () => {
  it("returns a connector without depending on a GPX geometry", async () => {
    const result = await joinRoute(
      {
        start: { latitude: 45.4, longitude: -72.73 },
        destination: { latitude: 45.41, longitude: -72.7 },
      },
      new MockRoutingProvider(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.route.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
  });

  it("surfaces a provider failure", async () => {
    const result = await joinRoute(
      {
        start: { latitude: 45.4, longitude: -72.73 },
        destination: { latitude: 45.41, longitude: -72.7 },
      },
      {
        async calculateRoute() {
          throw new Error("down");
        },
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("PROVIDER_ERROR");
    expect(result.error.message).toMatch(/raccordement/i);
  });
});
