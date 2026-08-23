import { describe, expect, it, vi } from "vitest";
import { offsetCoordinates } from "@/domain/geo/distance";
import type { GeneratedDestinationRoute, GeneratedLoopRoute, GeneratedRoundTripRoute } from "@/domain/ride/types";
import { MockRoutingProvider } from "@/infrastructure/routing/mock-routing-provider";
import type { RoutingProvider } from "@/infrastructure/routing/routing-provider";
import { recalculateRoute } from "./recalculate-route";

const start = {
  label: "Granby",
  coordinates: { latitude: 45.403, longitude: -72.734 },
};
const destination = {
  label: "Waterloo",
  coordinates: { latitude: 45.35, longitude: -72.516 },
};
const east = offsetCoordinates(start.coordinates, 90, 8);
const north = offsetCoordinates(east, 0, 8);

const loopGeometry: import("@/domain/geo/types").LineString = {
  type: "LineString",
  coordinates: [
    [start.coordinates.longitude, start.coordinates.latitude],
    [east.longitude, east.latitude],
    [north.longitude, north.latitude],
    [start.coordinates.longitude, start.coordinates.latitude],
  ],
};

const loopRoute: GeneratedLoopRoute = {
  id: "loop-1",
  type: "loop",
  start,
  targetDistanceKm: 24,
  style: "scenic",
  geometry: loopGeometry,
  segments: [],
  steps: [],
  distanceKm: 24,
  durationMinutes: 40,
  statistics: { repeatedRoadPercent: 3 },
  warnings: [],
};

const destinationGeometry: import("@/domain/geo/types").LineString = {
  type: "LineString",
  coordinates: [
    [start.coordinates.longitude, start.coordinates.latitude],
    [destination.coordinates.longitude, destination.coordinates.latitude],
  ],
};

const destinationRoute: GeneratedDestinationRoute = {
  id: "dest-1",
  type: "destination",
  start,
  destination,
  style: "curvy",
  geometry: destinationGeometry,
  segments: [],
  steps: [],
  distanceKm: 20,
  durationMinutes: 25,
  warnings: [],
};

const roundTripRoute: GeneratedRoundTripRoute = {
  id: "rt-1",
  type: "round_trip",
  start,
  destination,
  style: "touring",
  geometry: loopGeometry,
  segments: [],
  steps: [],
  distanceKm: 30,
  durationMinutes: 40,
  statistics: { repeatedRoadPercent: 8, outboundReturnOverlapPercent: 8 },
  warnings: [],
};

describe("recalculateRoute (FR-026, BR-008)", () => {
  it("keeps style and avoidance preferences on a destination reroute", async () => {
    const calculateRoute = vi.fn(async (input) => {
      return new MockRoutingProvider().calculateRoute(input);
    });
    const provider: RoutingProvider = { calculateRoute };

    const result = await recalculateRoute(
      {
        currentPosition: offsetCoordinates(start.coordinates, 180, 0.4),
        progressKm: 2,
        request: {
          type: "destination",
          start,
          destination,
          style: "curvy",
          preferences: { avoidHighways: true, avoidUnpaved: true },
        },
        originalRoute: destinationRoute,
      },
      provider,
    );

    expect(result.ok).toBe(true);
    expect(calculateRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: destination.coordinates,
        style: "curvy",
        preferences: { avoidHighways: true, avoidUnpaved: true },
      }),
      expect.anything(),
    );
    if (result.ok) {
      expect(result.route.type).toBe("destination");
      expect(result.route.style).toBe("curvy");
    }
  });

  it("recalculates a destination ride toward the final destination", async () => {
    const result = await recalculateRoute(
      {
        currentPosition: offsetCoordinates(start.coordinates, 0, 0.3),
        progressKm: 1,
        request: {
          type: "destination",
          start,
          destination,
          style: "curvy",
          preferences: { avoidHighways: false, avoidUnpaved: false },
        },
        originalRoute: destinationRoute,
      },
      new MockRoutingProvider(),
    );

    expect(result.ok).toBe(true);
    if (result.ok && result.route.type === "destination") {
      const last = result.route.geometry.coordinates.at(-1)!;
      expect(last[0]).toBeCloseTo(destination.coordinates.longitude, 1);
      expect(last[1]).toBeCloseTo(destination.coordinates.latitude, 1);
    }
  });

  it("rejoins a loop further along the remaining portion instead of the start", async () => {
    const calculateRoute = vi.fn(async (input) =>
      new MockRoutingProvider().calculateRoute(input),
    );
    const result = await recalculateRoute(
      {
        currentPosition: offsetCoordinates(start.coordinates, 180, 0.5),
        progressKm: 2,
        request: {
          type: "loop",
          start,
          targetDistanceKm: 24,
          style: "scenic",
          preferences: { avoidHighways: true, avoidUnpaved: false },
        },
        originalRoute: loopRoute,
      },
      { calculateRoute },
    );

    expect(result.ok).toBe(true);
    const target = calculateRoute.mock.calls[0]?.[0]?.destination;
    expect(target).toBeDefined();
    const backToStart = Math.hypot(
      (target?.latitude ?? 0) - start.coordinates.latitude,
      (target?.longitude ?? 0) - start.coordinates.longitude,
    );
    expect(backToStart).toBeGreaterThan(0.001);
  });

  it("rejoins a round trip to the remaining corridor instead of a direct return", async () => {
    const calculateRoute = vi.fn(async (input) =>
      new MockRoutingProvider().calculateRoute(input),
    );
    const result = await recalculateRoute(
      {
        currentPosition: offsetCoordinates(start.coordinates, 180, 0.4),
        progressKm: 3,
        request: {
          type: "round_trip",
          start,
          destination,
          style: "touring",
          preferences: { avoidHighways: false, avoidUnpaved: true },
        },
        originalRoute: roundTripRoute,
      },
      { calculateRoute },
    );

    expect(result.ok).toBe(true);
    expect(calculateRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        preferences: { avoidHighways: false, avoidUnpaved: true },
        style: "touring",
      }),
      expect.anything(),
    );
    const target = calculateRoute.mock.calls[0]?.[0]?.destination;
    expect(target).not.toEqual(start.coordinates);
  });

  it("returns an error without a replacement route when the provider fails", async () => {
    const provider: RoutingProvider = {
      async calculateRoute() {
        throw new Error("network down");
      },
    };
    const result = await recalculateRoute(
      {
        currentPosition: start.coordinates,
        progressKm: 1,
        request: {
          type: "destination",
          start,
          destination,
          style: "curvy",
          preferences: { avoidHighways: false, avoidUnpaved: false },
        },
        originalRoute: destinationRoute,
      },
      provider,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PROVIDER_ERROR");
      expect(result.error.message).toMatch(/itinéraire actuel reste affiché/);
    }
  });

  it("ignores a stale recalculate after abort or generation change", async () => {
    const controller = new AbortController();
    const provider: RoutingProvider = {
      async calculateRoute(_input, options) {
        controller.abort();
        if (options?.signal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        return new MockRoutingProvider().calculateRoute(_input);
      },
    };

    const result = await recalculateRoute(
      {
        currentPosition: start.coordinates,
        progressKm: 1,
        request: {
          type: "destination",
          start,
          destination,
          style: "curvy",
          preferences: { avoidHighways: false, avoidUnpaved: false },
        },
        originalRoute: destinationRoute,
      },
      provider,
      {
        signal: controller.signal,
        generation: 1,
        isCurrent: () => false,
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("STALE_RECALCULATE");
    }
  });

  it("does not append the leftover corridor twice near the end of a loop", async () => {
    const calculateRoute = vi.fn(async (input) =>
      new MockRoutingProvider().calculateRoute(input),
    );
    const result = await recalculateRoute(
      {
        currentPosition: offsetCoordinates(start.coordinates, 180, 0.3),
        progressKm: 23.6,
        request: {
          type: "loop",
          start,
          targetDistanceKm: 24,
          style: "scenic",
          preferences: { avoidHighways: true, avoidUnpaved: false },
        },
        originalRoute: loopRoute,
      },
      { calculateRoute },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const length = result.route.geometry.coordinates.length;
      const unique = new Set(
        result.route.geometry.coordinates.map((point) => point.join(",")),
      );
      expect(length).toBeLessThan(loopGeometry.coordinates.length + 4);
      expect(unique.size).toBe(length);
    }
  });

  it("does not call a real network provider in tests", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await recalculateRoute(
      {
        currentPosition: start.coordinates,
        progressKm: 1,
        request: {
          type: "destination",
          start,
          destination,
          style: "curvy",
          preferences: { avoidHighways: false, avoidUnpaved: false },
        },
        originalRoute: destinationRoute,
      },
      new MockRoutingProvider(),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
