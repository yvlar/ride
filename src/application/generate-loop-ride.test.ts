import { describe, expect, it } from "vitest";
import { haversineKm, offsetCoordinates, positionToCoordinates } from "@/domain/geo/distance";
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

  it("prefers a winding secondary loop over a highway when style is curvy (FR-004)", async () => {
    const start = GRANBY.coordinates;
    const rectanglePoints = [
      start,
      offsetCoordinates(start, 90, 20),
      offsetCoordinates(offsetCoordinates(start, 90, 20), 0, 20),
      offsetCoordinates(start, 0, 20),
      start,
    ];
    const windingPoints = [
      start,
      offsetCoordinates(start, 90, 10),
      offsetCoordinates(offsetCoordinates(start, 90, 10), 0, 10),
      offsetCoordinates(offsetCoordinates(offsetCoordinates(start, 90, 10), 0, 10), 270, 10),
      offsetCoordinates(start, 180, 8),
      offsetCoordinates(offsetCoordinates(start, 180, 8), 90, 18),
      offsetCoordinates(
        offsetCoordinates(offsetCoordinates(start, 180, 8), 90, 18),
        0,
        28,
      ),
      offsetCoordinates(start, 0, 12),
      start,
    ];

    const toResult = (
      points: typeof rectanglePoints,
      roadClass: string,
      elevationGainM: number,
      durationMinutes: number,
    ): ProviderRouteResult => {
      const coordinates: [number, number][] = [];
      for (let index = 0; index < points.length - 1; index += 1) {
        const from = points[index];
        const to = points[index + 1];
        for (let step = 0; step < 3; step += 1) {
          const t = step / 3;
          coordinates.push([
            from.longitude + (to.longitude - from.longitude) * t,
            from.latitude + (to.latitude - from.latitude) * t,
          ]);
        }
      }
      const last = points[points.length - 1];
      coordinates.push([last.longitude, last.latitude]);
      const geometry = { type: "LineString" as const, coordinates };
      const distanceKm = 80;
      return {
        geometry,
        segments: [
          {
            id: roadClass,
            geometry,
            distanceKm,
            durationMinutes,
            roadClass,
            elevationGainM,
          },
        ],
        distanceKm,
        durationMinutes,
      };
    };

    const highway = toResult(rectanglePoints, "motorway", 0, 50);
    const winding = toResult(windingPoints, "secondary", 700, 95);
    const provider: RoutingProvider = {
      async calculateRoute(input: ProviderRouteRequest) {
        return (input.waypoints?.length ?? 0) === 2 ? winding : highway;
      },
    };

    const result = await generateLoopRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        style: "curvy",
      },
      provider,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.segments[0]?.roadClass).toBe("secondary");
    expect(result.route.durationMinutes).toBe(95);
  });

  it("prefers a rural panoramic loop over a highway when style is scenic (FR-005)", async () => {
    const start = GRANBY.coordinates;
    const rectanglePoints = [
      start,
      offsetCoordinates(start, 90, 20),
      offsetCoordinates(offsetCoordinates(start, 90, 20), 0, 20),
      offsetCoordinates(start, 0, 20),
      start,
    ];

    const toResult = (
      roadClass: string,
      durationMinutes: number,
      landscapeFeatures?: ProviderRouteResult["segments"][number]["landscapeFeatures"],
    ): ProviderRouteResult => {
      const coordinates: [number, number][] = [];
      for (let index = 0; index < rectanglePoints.length - 1; index += 1) {
        const from = rectanglePoints[index];
        const to = rectanglePoints[index + 1];
        for (let step = 0; step < 3; step += 1) {
          const t = step / 3;
          coordinates.push([
            from.longitude + (to.longitude - from.longitude) * t,
            from.latitude + (to.latitude - from.latitude) * t,
          ]);
        }
      }
      const last = rectanglePoints[rectanglePoints.length - 1];
      coordinates.push([last.longitude, last.latitude]);
      const geometry = { type: "LineString" as const, coordinates };
      return {
        geometry,
        segments: [
          {
            id: roadClass,
            geometry,
            distanceKm: 80,
            durationMinutes,
            roadClass,
            landscapeFeatures,
          },
        ],
        distanceKm: 80,
        durationMinutes,
      };
    };

    const highway = toResult("motorway", 50);
    const panoramic = toResult("unclassified", 95, [
      "rural",
      "lake",
      "village",
      "panoramic",
    ]);
    const provider: RoutingProvider = {
      async calculateRoute(input: ProviderRouteRequest) {
        return (input.waypoints?.length ?? 0) === 2 ? panoramic : highway;
      },
    };

    const result = await generateLoopRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        style: "scenic",
      },
      provider,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.segments[0]?.roadClass).toBe("unclassified");
    expect(result.route.durationMinutes).toBe(95);
    expect(result.route.segments[0]?.landscapeFeatures).toEqual([
      "rural",
      "lake",
      "village",
      "panoramic",
    ]);
  });

  it("prefers a paved secondary loop over a highway when style is touring (FR-006)", async () => {
    const start = GRANBY.coordinates;
    const rectanglePoints = [
      start,
      offsetCoordinates(start, 90, 20),
      offsetCoordinates(offsetCoordinates(start, 90, 20), 0, 20),
      offsetCoordinates(start, 0, 20),
      start,
    ];

    const toResult = (
      roadClass: string,
      durationMinutes: number,
      surface: "paved" | "unpaved",
    ): ProviderRouteResult => {
      const coordinates: [number, number][] = [];
      for (let index = 0; index < rectanglePoints.length - 1; index += 1) {
        const from = rectanglePoints[index];
        const to = rectanglePoints[index + 1];
        for (let step = 0; step < 3; step += 1) {
          const t = step / 3;
          coordinates.push([
            from.longitude + (to.longitude - from.longitude) * t,
            from.latitude + (to.latitude - from.latitude) * t,
          ]);
        }
      }
      const last = rectanglePoints[rectanglePoints.length - 1];
      coordinates.push([last.longitude, last.latitude]);
      const geometry = { type: "LineString" as const, coordinates };
      return {
        geometry,
        segments: [
          {
            id: roadClass,
            geometry,
            distanceKm: 80,
            durationMinutes,
            roadClass,
            surface,
          },
        ],
        distanceKm: 80,
        durationMinutes,
      };
    };

    const highway = toResult("motorway", 50, "paved");
    const traverse = toResult("secondary", 70, "paved");
    const provider: RoutingProvider = {
      async calculateRoute(input: ProviderRouteRequest) {
        return (input.waypoints?.length ?? 0) === 2 ? traverse : highway;
      },
    };

    const result = await generateLoopRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        style: "touring",
      },
      provider,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.segments[0]?.roadClass).toBe("secondary");
    expect(result.route.durationMinutes).toBe(70);
    expect(result.route.segments[0]?.surface).toBe("paved");
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

  it("maps unpaved knowledge mixed with a geometric circle to the FR-021 message", async () => {
    let calls = 0;
    const mixed: RoutingProvider = {
      async calculateRoute(
        input: ProviderRouteRequest,
      ): Promise<ProviderRouteResult> {
        calls += 1;
        if (calls === 1) {
          return {
            geometry: createCircleLineString(input.start, 12, 36),
            segments: [],
            distanceKm: 75,
            durationMinutes: 80,
          };
        }
        throw unpavedKnowledgeError();
      },
    };

    const result = await generateLoopRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        preferences: { avoidHighways: false, avoidUnpaved: true },
      },
      mixed,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("NO_ROUTE_FOUND");
    expect(result.error.message).toMatch(/non pavées/);
    expect(result.error.message).toMatch(/FR-021/);
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
    expect(result.error.message).not.toMatch(/FR-021/);
    expect(result.error.message).not.toMatch(/non pavées/);
  });

  it("combines BR-001 with the FR-021 unpaved constraint on a mixed distance miss", async () => {
    let calls = 0;
    const mixed: RoutingProvider = {
      async calculateRoute(
        input: ProviderRouteRequest,
      ): Promise<ProviderRouteResult> {
        calls += 1;
        if (calls === 1) {
          const mock = new MockRoutingProvider(8);
          const routed = await mock.calculateRoute({
            ...input,
            waypoints: input.waypoints?.map((waypoint) => ({
              latitude: waypoint.latitude + 1,
              longitude: waypoint.longitude + 1,
            })),
          });
          return { ...routed, distanceKm: 400 };
        }
        throw unpavedKnowledgeError();
      },
    };

    const result = await generateLoopRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 50,
        preferences: { avoidHighways: false, avoidUnpaved: true },
      },
      mixed,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("DISTANCE_OUT_OF_TOLERANCE");
    expect(result.error.bestCandidate?.distanceKm).toBe(400);
    expect(result.error.message).toMatch(/BR-001/);
    expect(result.error.message).toMatch(/FR-021/);
    expect(result.error.message).toMatch(/non pavées/);
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

  it("keeps a leaked unpaved route when avoidance is off (BR-007)", async () => {
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
        preferences: { avoidHighways: false, avoidUnpaved: false },
      },
      leaky,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.segments.some((segment) => segment.surface === "unpaved")).toBe(
      true,
    );
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

  it("maps a mix of knowledge and provider errors to the unpaved FR-021 message", async () => {
    let calls = 0;
    const mixed: RoutingProvider = {
      async calculateRoute() {
        calls += 1;
        if (calls === 1) {
          throw new Error("upstream timeout");
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
});
