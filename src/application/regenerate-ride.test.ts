import { describe, expect, it } from "vitest";
import { generateRide } from "@/application/generate-ride";
import { regenerateRide } from "@/application/regenerate-ride";
import { offsetCoordinates } from "@/domain/geo/distance";
import { isWithinDistanceTolerance } from "@/domain/ride/constraints";
import { REGENERATION_MAX_OVERLAP_PERCENT } from "@/domain/ride/constants";
import { measureOverlapPercent } from "@/domain/ride/overlap";
import { MockRoutingProvider } from "@/infrastructure/routing/mock-routing-provider";
import type {
  ProviderRouteRequest,
  ProviderRouteResult,
  RoutingProvider,
} from "@/infrastructure/routing/routing-provider";

const GRANBY = {
  label: "Granby",
  coordinates: { latitude: 45.403, longitude: -72.734 },
};

const TREMBLANT = {
  label: "Mont-Tremblant",
  coordinates: { latitude: 46.118, longitude: -74.596 },
};

describe("regenerateRide (FR-012, BR-006)", () => {
  it("keeps loop criteria and returns a visibly different corridor (BR-001)", async () => {
    const request = {
      type: "loop" as const,
      start: GRANBY,
      targetDistanceKm: 80,
      style: "curvy" as const,
      preferences: { avoidHighways: true, avoidUnpaved: true },
    };
    const first = await generateRide(request, new MockRoutingProvider());
    expect(first.ok).toBe(true);
    if (!first.ok) {
      throw new Error(first.error.message);
    }

    const regenerated = await regenerateRide(
      {
        request,
        previousRoute: {
          type: first.route.type,
          geometry: first.route.geometry,
        },
      },
      new MockRoutingProvider(),
    );

    expect(regenerated.ok).toBe(true);
    if (!regenerated.ok) {
      throw new Error(regenerated.error.message);
    }
    expect(regenerated.route.type).toBe("loop");
    expect(regenerated.route.start).toEqual(GRANBY);
    if (regenerated.route.type !== "loop") {
      return;
    }
    expect(regenerated.route.style).toBe("curvy");
    expect(regenerated.route.targetDistanceKm).toBe(80);
    expect(
      isWithinDistanceTolerance(regenerated.route.distanceKm, 80),
    ).toBe(true);
    expect(
      measureOverlapPercent(first.route.geometry, regenerated.route.geometry),
    ).toBeLessThanOrEqual(REGENERATION_MAX_OVERLAP_PERCENT);
  });

  it("keeps destination criteria and returns a visibly different corridor", async () => {
    const request = {
      type: "destination" as const,
      start: GRANBY,
      destination: TREMBLANT,
      style: "scenic" as const,
      preferences: { avoidHighways: false, avoidUnpaved: true },
    };
    const first = await generateRide(request, new MockRoutingProvider());
    expect(first.ok).toBe(true);
    if (!first.ok) {
      throw new Error(first.error.message);
    }

    const regenerated = await regenerateRide(
      {
        request,
        previousRoute: {
          type: first.route.type,
          geometry: first.route.geometry,
        },
      },
      new MockRoutingProvider(),
    );

    expect(regenerated.ok).toBe(true);
    if (!regenerated.ok) {
      throw new Error(regenerated.error.message);
    }
    expect(regenerated.route.type).toBe("destination");
    if (regenerated.route.type !== "destination") {
      return;
    }
    expect(regenerated.route.start).toEqual(GRANBY);
    expect(regenerated.route.destination).toEqual(TREMBLANT);
    expect(regenerated.route.style).toBe("scenic");
    expect(
      measureOverlapPercent(first.route.geometry, regenerated.route.geometry),
    ).toBeLessThanOrEqual(REGENERATION_MAX_OVERLAP_PERCENT);
  });

  it("keeps round-trip criteria and returns a visibly different corridor", async () => {
    const request = {
      type: "round_trip" as const,
      start: GRANBY,
      destination: TREMBLANT,
      style: "touring" as const,
      preferences: { avoidHighways: false, avoidUnpaved: false },
    };
    const first = await generateRide(request, new MockRoutingProvider());
    expect(first.ok).toBe(true);
    if (!first.ok) {
      throw new Error(first.error.message);
    }

    const regenerated = await regenerateRide(
      {
        request,
        previousRoute: {
          type: first.route.type,
          geometry: first.route.geometry,
        },
      },
      new MockRoutingProvider(),
    );

    expect(regenerated.ok).toBe(true);
    if (!regenerated.ok) {
      throw new Error(regenerated.error.message);
    }
    expect(regenerated.route.type).toBe("round_trip");
    if (regenerated.route.type !== "round_trip") {
      return;
    }
    expect(regenerated.route.start).toEqual(GRANBY);
    expect(regenerated.route.destination).toEqual(TREMBLANT);
    expect(regenerated.route.style).toBe("touring");
    expect(
      measureOverlapPercent(first.route.geometry, regenerated.route.geometry),
    ).toBeLessThanOrEqual(REGENERATION_MAX_OVERLAP_PERCENT);
  });

  it("explains when the network cannot produce a distinct corridor", async () => {
    const request = {
      type: "loop" as const,
      start: GRANBY,
      targetDistanceKm: 80,
      style: "curvy" as const,
    };
    const frozen: RoutingProvider = {
      async calculateRoute(
        input: ProviderRouteRequest,
      ): Promise<ProviderRouteResult> {
        const start = input.start;
        return new MockRoutingProvider().calculateRoute({
          ...input,
          destination: start,
          waypoints: [
            offsetCoordinates(start, 0, 20),
            offsetCoordinates(start, 90, 20),
          ],
        });
      },
    };

    const first = await generateRide(request, frozen);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      throw new Error(first.error.message);
    }

    const regenerated = await regenerateRide(
      {
        request,
        previousRoute: {
          type: first.route.type,
          geometry: first.route.geometry,
        },
      },
      frozen,
    );

    expect(regenerated.ok).toBe(false);
    if (regenerated.ok) {
      return;
    }
    expect(regenerated.error.code).toBe("NO_ROUTE_FOUND");
    expect(regenerated.error.message).toMatch(/FR-012|BR-006/);
    expect(regenerated.error.suggestions.length).toBeGreaterThan(0);
  });

  it("forwards the same avoidance preferences to the provider (BR-007)", async () => {
    const seen: ProviderRouteRequest[] = [];
    const provider: RoutingProvider = {
      async calculateRoute(input) {
        seen.push(input);
        return new MockRoutingProvider().calculateRoute(input);
      },
    };
    const request = {
      type: "loop" as const,
      start: GRANBY,
      targetDistanceKm: 80,
      style: "touring" as const,
      preferences: { avoidHighways: true, avoidUnpaved: true },
    };
    const first = await generateRide(request, new MockRoutingProvider());
    expect(first.ok).toBe(true);
    if (!first.ok) {
      throw new Error(first.error.message);
    }

    const regenerated = await regenerateRide(
      {
        request,
        previousRoute: {
          type: first.route.type,
          geometry: first.route.geometry,
        },
      },
      provider,
    );

    expect(regenerated.ok).toBe(true);
    if (!regenerated.ok) {
      throw new Error(regenerated.error.message);
    }
    expect(
      seen.some(
        (call) =>
          call.preferences?.avoidHighways === true &&
          call.preferences.avoidUnpaved === true,
      ),
    ).toBe(true);
  });

  it("rejects a type mismatch between the request and the previous route", async () => {
    const result = await regenerateRide(
      {
        request: {
          type: "loop",
          start: GRANBY,
          targetDistanceKm: 80,
        },
        previousRoute: {
          type: "destination",
          geometry: {
            type: "LineString",
            coordinates: [
              [-72.734, 45.403],
              [-72.7, 45.45],
            ],
          },
        },
      },
      new MockRoutingProvider(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(result.error.message).toMatch(/FR-012/);
  });

  it("rejects an envelope missing the previous corridor", async () => {
    const result = await regenerateRide(
      {
        request: {
          type: "loop",
          start: GRANBY,
          targetDistanceKm: 80,
        },
      },
      new MockRoutingProvider(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("VALIDATION_ERROR");
  });
});
