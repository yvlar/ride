import { describe, expect, it } from "vitest";
import { haversineKm, offsetCoordinates, positionToCoordinates } from "@/domain/geo/distance";
import { headingChangePerKm } from "@/domain/geo/geometry";
import { isWithinDistanceTolerance } from "@/domain/ride/constraints";
import { MockRoutingProvider } from "@/infrastructure/routing/mock-routing-provider";
import type {
  ProviderRouteRequest,
  ProviderRouteResult,
  RoutingProvider,
} from "@/infrastructure/routing/routing-provider";
import { generateDestinationRide } from "./generate-destination-ride";

const GRANBY = {
  label: "Granby",
  coordinates: { latitude: 45.403, longitude: -72.734 },
};

const TREMBLANT = {
  label: "Mont-Tremblant",
  coordinates: { latitude: 46.118, longitude: -74.596 },
};

describe("generateDestinationRide (FR-002)", () => {
  it("generates a road-network route from start to destination", async () => {
    const result = await generateDestinationRide(
      {
        type: "destination",
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
      haversineKm(TREMBLANT.coordinates, positionToCoordinates(last)),
    ).toBeLessThan(2.6);
    expect(result.route.type).toBe("destination");
    expect(result.route.style).toBe("curvy");
    expect(result.route.destination.label).toBe("Mont-Tremblant");
    expect(result.route.geometry.coordinates.length).toBeGreaterThan(8);
  });

  it("generates a short nearby destination without inflating the distance (FR-002)", async () => {
    const mock = new MockRoutingProvider();

    for (const km of [3, 5]) {
      const nearby = {
        label: "Nearby",
        coordinates: offsetCoordinates(GRANBY.coordinates, 90, km),
      };
      const direct = await mock.calculateRoute({
        start: GRANBY.coordinates,
        destination: nearby.coordinates,
      });

      const result = await generateDestinationRide(
        {
          type: "destination",
          start: GRANBY,
          destination: nearby,
          style: "touring",
        },
        mock,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(result.error.message);
      }

      expect(result.route.geometry.coordinates.length).toBeGreaterThanOrEqual(3);
      expect(result.route.distanceKm).toBeLessThanOrEqual(
        direct.distanceKm * 1.75 + 0.1,
      );
    }
  });

  it("maps a total routing outage to PROVIDER_ERROR", async () => {
    const down: RoutingProvider = {
      async calculateRoute() {
        throw new Error("upstream timeout");
      },
    };

    const result = await generateDestinationRide(
      {
        type: "destination",
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

  it("prefers a curvier corridor over the fastest mock path (BR-003)", async () => {
    const mock = new MockRoutingProvider();
    const direct = await mock.calculateRoute({
      start: GRANBY.coordinates,
      destination: TREMBLANT.coordinates,
    });

    const result = await generateDestinationRide(
      {
        type: "destination",
        start: GRANBY,
        destination: TREMBLANT,
        style: "curvy",
      },
      mock,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(headingChangePerKm(result.route.geometry)).toBeGreaterThan(
      headingChangePerKm(direct.geometry),
    );
    expect(result.route.durationMinutes).toBeGreaterThan(direct.durationMinutes);
  });

  it("converts an available duration via BR-005 then applies BR-001", async () => {
    const result = await generateDestinationRide(
      {
        type: "destination",
        start: GRANBY,
        destination: TREMBLANT,
        availableDurationMinutes: 180,
        style: "touring",
      },
      new MockRoutingProvider(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.route.targetDistanceKm).toBe(240);
    expect(
      isWithinDistanceTolerance(result.route.distanceKm, 240),
    ).toBe(true);
  });

  it("explains a BR-001 miss instead of silently widening the tolerance", async () => {
    const farProvider: RoutingProvider = {
      async calculateRoute(
        input: ProviderRouteRequest,
      ): Promise<ProviderRouteResult> {
        const mock = new MockRoutingProvider();
        const routed = await mock.calculateRoute(input);
        return { ...routed, distanceKm: 900 };
      },
    };

    const result = await generateDestinationRide(
      {
        type: "destination",
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

    const result = await generateDestinationRide(
      {
        type: "destination",
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
    expect(result.route.type).toBe("destination");
  });

  it("rejects a destination coinciding with the start", async () => {
    const result = await generateDestinationRide({
      type: "destination",
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

  it("does not generate a round trip (FR-003 remains out of scope)", async () => {
    const result = await generateDestinationRide({
      type: "round_trip",
      start: GRANBY,
      destination: TREMBLANT,
      style: "curvy",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("UNSUPPORTED_RIDE_TYPE");
  });
});
