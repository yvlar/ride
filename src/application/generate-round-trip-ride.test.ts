import { describe, expect, it } from "vitest";
import {
  haversineKm,
  offsetCoordinates,
  positionToCoordinates,
} from "@/domain/geo/distance";
import { isWithinDistanceTolerance } from "@/domain/ride/constraints";
import { measureOverlapPercent } from "@/domain/ride/overlap";
import { MockRoutingProvider } from "@/infrastructure/routing/mock-routing-provider";
import type {
  ProviderRouteRequest,
  ProviderRouteResult,
  RoutingProvider,
} from "@/infrastructure/routing/routing-provider";
import { generateRoundTripRide } from "./generate-round-trip-ride";

const GRANBY = {
  label: "Granby",
  coordinates: { latitude: 45.403, longitude: -72.734 },
};

const TREMBLANT = {
  label: "Mont-Tremblant",
  coordinates: { latitude: 46.118, longitude: -74.596 },
};

describe("generateRoundTripRide (FR-003)", () => {
  it("generates start → destination → start on the road network", async () => {
    const result = await generateRoundTripRide(
      {
        type: "round_trip",
        start: GRANBY,
        destination: TREMBLANT,
        style: "curvy",
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
    ).toBeLessThan(2.6);
    expect(
      haversineKm(GRANBY.coordinates, positionToCoordinates(last)),
    ).toBeLessThan(2.6);
    expect(
      result.route.geometry.coordinates.some(
        (position) =>
          haversineKm(
            TREMBLANT.coordinates,
            positionToCoordinates(position),
          ) < 2.6,
      ),
    ).toBe(true);
    expect(result.route.type).toBe("round_trip");
    expect(result.route.style).toBe("curvy");
    expect(result.route.destination.label).toBe("Mont-Tremblant");
    expect(result.route.geometry.coordinates.length).toBeGreaterThan(16);
    expect(result.route.statistics.outboundReturnOverlapPercent).toBeGreaterThanOrEqual(
      0,
    );
  });

  it("prefers a different return over an out-and-back on the same road (BR-002)", async () => {
    const mock = new MockRoutingProvider();
    const east = {
      label: "East",
      coordinates: offsetCoordinates(GRANBY.coordinates, 90, 20),
    };
    const sameRoad = await mock.calculateRoute({
      start: GRANBY.coordinates,
      destination: east.coordinates,
    });
    const sameRoadReturn = await mock.calculateRoute({
      start: east.coordinates,
      destination: GRANBY.coordinates,
    });
    const sameRoadOverlap = measureOverlapPercent(
      sameRoad.geometry,
      sameRoadReturn.geometry,
    );

    const result = await generateRoundTripRide(
      {
        type: "round_trip",
        start: GRANBY,
        destination: east,
        style: "touring",
      },
      mock,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.route.statistics.outboundReturnOverlapPercent).toBeLessThan(
      sameRoadOverlap,
    );
    expect(result.route.statistics.outboundReturnOverlapPercent).toBeLessThan(40);
  });

  it("warns instead of pretending the legs are distinct when overlap is inevitable", async () => {
    const mock = new MockRoutingProvider();
    const forcedSameRoad: RoutingProvider = {
      async calculateRoute(input: ProviderRouteRequest) {
        return mock.calculateRoute({
          start: input.start,
          destination: input.destination,
        });
      },
    };
    const nearby = {
      label: "Nearby east",
      coordinates: offsetCoordinates(GRANBY.coordinates, 90, 16),
    };

    const result = await generateRoundTripRide(
      {
        type: "round_trip",
        start: GRANBY,
        destination: nearby,
        style: "scenic",
      },
      forcedSameRoad,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.statistics.outboundReturnOverlapPercent).toBeGreaterThan(
      70,
    );
    expect(result.route.warnings.join(" ")).toMatch(/réutilise/);
  });

  it("maps a total routing outage to PROVIDER_ERROR", async () => {
    const down: RoutingProvider = {
      async calculateRoute() {
        throw new Error("upstream timeout");
      },
    };

    const result = await generateRoundTripRide(
      {
        type: "round_trip",
        start: GRANBY,
        destination: TREMBLANT,
        style: "curvy",
      },
      down,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("PROVIDER_ERROR");
  });

  it("converts an available duration via BR-005 then applies BR-001", async () => {
    const nearby = {
      label: "Nearby",
      coordinates: offsetCoordinates(GRANBY.coordinates, 45, 12),
    };
    const result = await generateRoundTripRide(
      {
        type: "round_trip",
        start: GRANBY,
        destination: nearby,
        availableDurationMinutes: 30,
        style: "scenic",
      },
      new MockRoutingProvider(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.route.targetDistanceKm).toBe(32.5);
    expect(isWithinDistanceTolerance(result.route.distanceKm, 32.5)).toBe(true);
  });

  it("explains a BR-001 miss instead of silently widening the tolerance", async () => {
    const farProvider: RoutingProvider = {
      async calculateRoute(
        input: ProviderRouteRequest,
      ): Promise<ProviderRouteResult> {
        const mock = new MockRoutingProvider();
        const routed = await mock.calculateRoute(input);
        return { ...routed, distanceKm: 450 };
      },
    };

    const result = await generateRoundTripRide(
      {
        type: "round_trip",
        start: GRANBY,
        destination: TREMBLANT,
        targetDistanceKm: 200,
        style: "scenic",
      },
      farProvider,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("DISTANCE_OUT_OF_TOLERANCE");
    expect(result.error.bestCandidate?.distanceKm).toBe(900);
    expect(result.error.message).toMatch(/BR-001/);
  });

  it("ignores a failing candidate instead of aborting generation", async () => {
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

    const result = await generateRoundTripRide(
      {
        type: "round_trip",
        start: GRANBY,
        destination: TREMBLANT,
        style: "scenic",
      },
      flaky,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.type).toBe("round_trip");
  });

  it("rejects a destination coinciding with the start", async () => {
    const result = await generateRoundTripRide({
      type: "round_trip",
      start: GRANBY,
      destination: GRANBY,
      style: "curvy",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("does not generate a loop or a one-way destination", async () => {
    const loop = await generateRoundTripRide({
      type: "loop",
      start: GRANBY,
      targetDistanceKm: 80,
    });
    const destination = await generateRoundTripRide({
      type: "destination",
      start: GRANBY,
      destination: TREMBLANT,
      style: "curvy",
    });

    expect(loop.ok).toBe(false);
    expect(destination.ok).toBe(false);
    if (loop.ok || destination.ok) {
      return;
    }
    expect(loop.error.code).toBe("UNSUPPORTED_RIDE_TYPE");
    expect(destination.error.code).toBe("UNSUPPORTED_RIDE_TYPE");
  });
});
