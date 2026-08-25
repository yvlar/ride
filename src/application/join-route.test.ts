import { describe, expect, it, vi } from "vitest";
import { DEFAULT_ROUTE_PREFERENCES } from "@/domain/ride/stored-route-preferences";
import { MockRoutingProvider } from "@/infrastructure/routing/mock-routing-provider";
import { joinRoute } from "./join-route";

describe("joinRoute (FR-039, BR-010)", () => {
  it("returns a connector without depending on a GPX geometry", async () => {
    const provider = new MockRoutingProvider();
    const spy = vi.spyOn(provider, "calculateRoute");
    const result = await joinRoute(
      {
        start: { latitude: 45.4, longitude: -72.73 },
        destination: { latitude: 45.41, longitude: -72.7 },
      },
      provider,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.route.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
    expect(spy.mock.calls[0]?.[0].preferences).toEqual(DEFAULT_ROUTE_PREFERENCES);
  });

  it("forwards stored route preferences to the connector (FR-007, FR-008, FR-030, FR-039)", async () => {
    const provider = new MockRoutingProvider();
    const spy = vi.spyOn(provider, "calculateRoute");
    const preferences = {
      avoidHighways: false,
      avoidUnpaved: false,
      stayInCanada: true,
    };
    const result = await joinRoute(
      {
        start: { latitude: 45.4, longitude: -72.73 },
        destination: { latitude: 45.41, longitude: -72.7 },
        preferences,
      },
      provider,
    );
    expect(result.ok).toBe(true);
    expect(spy.mock.calls[0]?.[0].preferences).toEqual(preferences);
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
