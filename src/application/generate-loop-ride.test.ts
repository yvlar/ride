import { describe, expect, it } from "vitest";
import { haversineKm, positionToCoordinates } from "@/domain/geo/distance";
import {
  createCircleLineString,
  radiusCoefficientOfVariation,
} from "@/domain/geo/geometry";
import { isWithinDistanceTolerance } from "@/domain/ride/constraints";
import { MockRoutingProvider } from "@/infrastructure/routing/mock-routing-provider";
import {
  disconnectedKnowledgeError,
  emptyKnowledgeError,
  unpavedKnowledgeError,
} from "@/infrastructure/routing/routing-knowledge-error";
import type {
  ProviderRouteRequest,
  ProviderRouteResult,
  RoutingProvider,
} from "@/infrastructure/routing/routing-provider";
import { generateLoopRide } from "./generate-loop-ride";

const GRANBY = {
  label: "Granby",
  coordinates: { latitude: 45.403, longitude: -72.734 },
};

describe("generateLoopRide (FR-001)", () => {
  it("generates a closed road-network loop within BR-001 distance tolerance", async () => {
    const result = await generateLoopRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
      },
      new MockRoutingProvider(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const first = result.route.geometry.coordinates[0];
    const last =
      result.route.geometry.coordinates[
        result.route.geometry.coordinates.length - 1
      ];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    if (!first || !last) {
      return;
    }

    expect(
      haversineKm(GRANBY.coordinates, positionToCoordinates(first)),
    ).toBeLessThan(2.1);
    expect(
      haversineKm(GRANBY.coordinates, positionToCoordinates(last)),
    ).toBeLessThan(2.1);
    expect(
      isWithinDistanceTolerance(result.route.distanceKm, 80),
    ).toBe(true);
    expect(result.route.geometry.coordinates.length).toBeGreaterThan(8);
    expect(radiusCoefficientOfVariation(result.route.geometry)).toBeGreaterThan(
      0.06,
    );
    expect(result.route.statistics.repeatedRoadPercent).toBeGreaterThanOrEqual(0);
    expect(result.route.type).toBe("loop");
  });

  it("converts an available duration via BR-005 before generating the loop", async () => {
    const result = await generateLoopRide(
      {
        type: "loop",
        start: GRANBY,
        availableDurationMinutes: 60,
        style: "touring",
      },
      new MockRoutingProvider(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.route.targetDistanceKm).toBe(80);
    expect(isWithinDistanceTolerance(result.route.distanceKm, 80)).toBe(true);
  });

  it("rejects destination and round-trip types at the loop generator boundary", async () => {
    const destination = await generateLoopRide({
      type: "destination",
      start: GRANBY,
    });
    const roundTrip = await generateLoopRide({
      type: "round_trip",
      start: GRANBY,
    });

    expect(destination.ok).toBe(false);
    expect(roundTrip.ok).toBe(false);
    if (destination.ok || roundTrip.ok) {
      return;
    }
    expect(destination.error.code).toBe("UNSUPPORTED_RIDE_TYPE");
    expect(roundTrip.error.code).toBe("UNSUPPORTED_RIDE_TYPE");
  });

  it("rejects a provider that only returns a geometric circle", async () => {
    const circleProvider: RoutingProvider = {
      async calculateRoute(
        input: ProviderRouteRequest,
      ): Promise<ProviderRouteResult> {
        const geometry = createCircleLineString(input.start, 12, 36);
        return {
          geometry,
          segments: [],
          distanceKm: 75,
          durationMinutes: 80,
        };
      },
    };

    const result = await generateLoopRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
      },
      circleProvider,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("GEOMETRIC_LOOP_REJECTED");
  });

  it("explains a BR-001 miss instead of silently widening the tolerance", async () => {
    const farProvider: RoutingProvider = {
      async calculateRoute(
        input: ProviderRouteRequest,
      ): Promise<ProviderRouteResult> {
        const mock = new MockRoutingProvider(8);
        const routed = await mock.calculateRoute({
          ...input,
          waypoints: input.waypoints?.map((waypoint) => ({
            latitude: waypoint.latitude + 1,
            longitude: waypoint.longitude + 1,
          })),
        });
        return { ...routed, distanceKm: 400 };
      },
    };

    const result = await generateLoopRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 50,
      },
      farProvider,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("DISTANCE_OUT_OF_TOLERANCE");
    expect(result.error.bestCandidate?.distanceKm).toBe(400);
    expect(result.error.message).toMatch(/BR-001/);
  });

  it("ignores a failing candidate instead of crashing the Vercel function", async () => {
    const mock = new MockRoutingProvider();
    let calls = 0;
    const flaky: RoutingProvider = {
      async calculateRoute(input: ProviderRouteRequest) {
        calls += 1;
        if (calls === 1) {
          throw new Error("upstream timeout");
        }
        return mock.calculateRoute(input);
      },
    };

    const result = await generateLoopRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
      },
      flaky,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(isWithinDistanceTolerance(result.route.distanceKm, 80)).toBe(true);
  });

  it("rejects a provider that leaked known unpaved when avoidance is on (BR-007)", async () => {
    const mock = new MockRoutingProvider();
    const leaky: RoutingProvider = {
      async calculateRoute(input: ProviderRouteRequest) {
        const routed = await mock.calculateRoute({
          ...input,
          preferences: undefined,
        });
        return {
          ...routed,
          segments: routed.segments.map((segment) => ({
            ...segment,
            surface: "unpaved" as const,
          })),
        };
      },
    };

    const result = await generateLoopRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        preferences: { avoidHighways: false, avoidUnpaved: true },
      },
      leaky,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("NO_ROUTE_FOUND");
    expect(result.error.message).toMatch(/non pavées/);
  });

  it("maps mixed knowledge failures to the unpaved FR-021 message", async () => {
    let calls = 0;
    const mixed: RoutingProvider = {
      async calculateRoute() {
        calls += 1;
        if (calls % 3 === 1) {
          throw emptyKnowledgeError();
        }
        if (calls % 3 === 2) {
          throw disconnectedKnowledgeError();
        }
        throw unpavedKnowledgeError();
      },
    };

    const result = await generateLoopRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
      },
      mixed,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("NO_ROUTE_FOUND");
    expect(result.error.message).toMatch(/non pavées/);
  });

  it("maps a full provider outage to PROVIDER_ERROR", async () => {
    const down: RoutingProvider = {
      async calculateRoute() {
        throw new Error("upstream timeout");
      },
    };

    const result = await generateLoopRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
      },
      down,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("PROVIDER_ERROR");
  });
});
