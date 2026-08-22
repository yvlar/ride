import { describe, expect, it } from "vitest";
import { haversineKm, offsetCoordinates, positionToCoordinates } from "@/domain/geo/distance";
import { createCircleLineString, headingChangePerKm } from "@/domain/geo/geometry";
import { isWithinDistanceTolerance } from "@/domain/ride/constraints";
import { HIGHWAY_AVOIDANCE_WARNING } from "@/domain/ride/highways";
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

    for (const km of [1.1, 1.5, 2, 2.5, 3, 5]) {
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

      const firstPoint = positionToCoordinates(first);
      const lastPoint = positionToCoordinates(last);
      expect(result.route.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
      expect(
        haversineKm(GRANBY.coordinates, firstPoint),
      ).toBeLessThan(
        haversineKm(nearby.coordinates, firstPoint),
      );
      expect(
        haversineKm(nearby.coordinates, lastPoint),
      ).toBeLessThan(
        haversineKm(GRANBY.coordinates, lastPoint),
      );
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

  it("selects a slower winding secondary climb over a highway (FR-004, BR-003)", async () => {
    const highway: ProviderRouteResult = {
      geometry: {
        type: "LineString",
        coordinates: [
          [GRANBY.coordinates.longitude, GRANBY.coordinates.latitude],
          [
            (GRANBY.coordinates.longitude + TREMBLANT.coordinates.longitude) / 2,
            (GRANBY.coordinates.latitude + TREMBLANT.coordinates.latitude) / 2,
          ],
          [TREMBLANT.coordinates.longitude, TREMBLANT.coordinates.latitude],
        ],
      },
      segments: [
        {
          id: "autoroutes",
          geometry: {
            type: "LineString",
            coordinates: [
              [GRANBY.coordinates.longitude, GRANBY.coordinates.latitude],
              [TREMBLANT.coordinates.longitude, TREMBLANT.coordinates.latitude],
            ],
          },
          distanceKm: 180,
          durationMinutes: 90,
          roadClass: "motorway",
          elevationGainM: 0,
        },
      ],
      distanceKm: 180,
      durationMinutes: 90,
    };

    const east = offsetCoordinates(GRANBY.coordinates, 90, 25);
    const north = offsetCoordinates(east, 0, 40);
    const west = offsetCoordinates(north, 270, 80);
    const winding: ProviderRouteResult = {
      geometry: {
        type: "LineString",
        coordinates: [
          [GRANBY.coordinates.longitude, GRANBY.coordinates.latitude],
          [east.longitude, east.latitude],
          [north.longitude, north.latitude],
          [west.longitude, west.latitude],
          [TREMBLANT.coordinates.longitude, TREMBLANT.coordinates.latitude],
        ],
      },
      segments: [
        {
          id: "cretes",
          geometry: {
            type: "LineString",
            coordinates: [
              [GRANBY.coordinates.longitude, GRANBY.coordinates.latitude],
              [TREMBLANT.coordinates.longitude, TREMBLANT.coordinates.latitude],
            ],
          },
          distanceKm: 210,
          durationMinutes: 190,
          roadClass: "secondary",
          elevationGainM: 850,
        },
      ],
      distanceKm: 210,
      durationMinutes: 190,
    };

    const provider: RoutingProvider = {
      async calculateRoute(input) {
        return (input.waypoints?.length ?? 0) === 0 ? highway : winding;
      },
    };

    const result = await generateDestinationRide(
      {
        type: "destination",
        start: GRANBY,
        destination: TREMBLANT,
        style: "curvy",
      },
      provider,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.durationMinutes).toBe(190);
    expect(result.route.segments[0]?.roadClass).toBe("secondary");
    expect(result.route.segments[0]?.elevationGainM).toBe(850);
  });

  it("selects a slower rural panoramic corridor over a highway (FR-005, BR-003)", async () => {
    const highway: ProviderRouteResult = {
      geometry: {
        type: "LineString",
        coordinates: [
          [GRANBY.coordinates.longitude, GRANBY.coordinates.latitude],
          [
            (GRANBY.coordinates.longitude + TREMBLANT.coordinates.longitude) / 2,
            (GRANBY.coordinates.latitude + TREMBLANT.coordinates.latitude) / 2,
          ],
          [TREMBLANT.coordinates.longitude, TREMBLANT.coordinates.latitude],
        ],
      },
      segments: [
        {
          id: "autoroutes",
          geometry: {
            type: "LineString",
            coordinates: [
              [GRANBY.coordinates.longitude, GRANBY.coordinates.latitude],
              [TREMBLANT.coordinates.longitude, TREMBLANT.coordinates.latitude],
            ],
          },
          distanceKm: 180,
          durationMinutes: 90,
          roadClass: "motorway",
        },
      ],
      distanceKm: 180,
      durationMinutes: 90,
    };

    const scenic: ProviderRouteResult = {
      geometry: highway.geometry,
      segments: [
        {
          id: "rangs",
          geometry: highway.segments[0]!.geometry,
          distanceKm: 200,
          durationMinutes: 190,
          roadClass: "unclassified",
          landscapeFeatures: ["rural", "lake", "village", "panoramic"],
        },
      ],
      distanceKm: 200,
      durationMinutes: 190,
    };

    const provider: RoutingProvider = {
      async calculateRoute(input) {
        return (input.waypoints?.length ?? 0) === 0 ? highway : scenic;
      },
    };

    const result = await generateDestinationRide(
      {
        type: "destination",
        start: GRANBY,
        destination: TREMBLANT,
        style: "scenic",
      },
      provider,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.durationMinutes).toBe(190);
    expect(result.route.segments[0]?.roadClass).toBe("unclassified");
    expect(result.route.segments[0]?.landscapeFeatures).toEqual([
      "rural",
      "lake",
      "village",
      "panoramic",
    ]);
  });

  it("selects a slower paved secondary corridor over a highway (FR-006, BR-003)", async () => {
    const highway: ProviderRouteResult = {
      geometry: {
        type: "LineString",
        coordinates: [
          [GRANBY.coordinates.longitude, GRANBY.coordinates.latitude],
          [
            (GRANBY.coordinates.longitude + TREMBLANT.coordinates.longitude) / 2,
            (GRANBY.coordinates.latitude + TREMBLANT.coordinates.latitude) / 2,
          ],
          [TREMBLANT.coordinates.longitude, TREMBLANT.coordinates.latitude],
        ],
      },
      segments: [
        {
          id: "autoroutes",
          geometry: {
            type: "LineString",
            coordinates: [
              [GRANBY.coordinates.longitude, GRANBY.coordinates.latitude],
              [TREMBLANT.coordinates.longitude, TREMBLANT.coordinates.latitude],
            ],
          },
          distanceKm: 180,
          durationMinutes: 90,
          roadClass: "motorway",
          surface: "paved",
        },
      ],
      distanceKm: 180,
      durationMinutes: 90,
    };

    const east = offsetCoordinates(GRANBY.coordinates, 90, 20);
    const north = offsetCoordinates(east, 0, 25);
    const touring: ProviderRouteResult = {
      geometry: {
        type: "LineString",
        coordinates: [
          [GRANBY.coordinates.longitude, GRANBY.coordinates.latitude],
          [east.longitude, east.latitude],
          [north.longitude, north.latitude],
          [TREMBLANT.coordinates.longitude, TREMBLANT.coordinates.latitude],
        ],
      },
      segments: [
        {
          id: "traverse",
          geometry: {
            type: "LineString",
            coordinates: [
              [GRANBY.coordinates.longitude, GRANBY.coordinates.latitude],
              [TREMBLANT.coordinates.longitude, TREMBLANT.coordinates.latitude],
            ],
          },
          distanceKm: 200,
          durationMinutes: 160,
          roadClass: "secondary",
          surface: "paved",
        },
      ],
      distanceKm: 200,
      durationMinutes: 160,
    };

    const provider: RoutingProvider = {
      async calculateRoute(input) {
        return (input.waypoints?.length ?? 0) === 0 ? highway : touring;
      },
    };

    const result = await generateDestinationRide(
      {
        type: "destination",
        start: GRANBY,
        destination: TREMBLANT,
        style: "touring",
      },
      provider,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.durationMinutes).toBe(160);
    expect(result.route.segments[0]?.roadClass).toBe("secondary");
    expect(result.route.segments[0]?.surface).toBe("paved");
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
          const mock = new MockRoutingProvider();
          const routed = await mock.calculateRoute(input);
          return { ...routed, distanceKm: 900 };
        }
        throw unpavedKnowledgeError();
      },
    };

    const result = await generateDestinationRide(
      {
        type: "destination",
        start: GRANBY,
        destination: TREMBLANT,
        targetDistanceKm: 200,
        style: "scenic",
        preferences: { avoidHighways: false, avoidUnpaved: true },
      },
      mixed,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("DISTANCE_OUT_OF_TOLERANCE");
    expect(result.error.bestCandidate?.distanceKm).toBe(900);
    expect(result.error.message).toMatch(/BR-001/);
    expect(result.error.message).toMatch(/FR-021/);
    expect(result.error.message).toMatch(/non pavées/);
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

    const result = await generateDestinationRide(
      {
        type: "destination",
        start: GRANBY,
        destination: TREMBLANT,
        style: "scenic",
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

    const result = await generateDestinationRide(
      {
        type: "destination",
        start: GRANBY,
        destination: TREMBLANT,
        style: "scenic",
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

  it("maps unpaved knowledge mixed with an unusable fulfill to the FR-021 message", async () => {
    let calls = 0;
    const mixed: RoutingProvider = {
      async calculateRoute(input: ProviderRouteRequest) {
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

    const result = await generateDestinationRide(
      {
        type: "destination",
        start: GRANBY,
        destination: TREMBLANT,
        style: "scenic",
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

  it("selects a reasonable non-highway corridor when avoidHighways is on (FR-007)", async () => {
    const mock = new MockRoutingProvider();
    const provider: RoutingProvider = {
      async calculateRoute(input) {
        const routed = await mock.calculateRoute(input);
        const highway = (input.waypoints?.length ?? 0) === 0;
        return {
          ...routed,
          segments: routed.segments.map((segment) =>
            highway
              ? { ...segment, roadClass: "motorway", surface: "paved" as const }
              : { ...segment, roadClass: "primary", surface: undefined },
          ),
        };
      },
    };

    const avoided = await generateDestinationRide(
      {
        type: "destination",
        start: GRANBY,
        destination: TREMBLANT,
        style: "touring",
        preferences: { avoidHighways: true, avoidUnpaved: false },
      },
      provider,
    );

    expect(avoided.ok).toBe(true);
    if (!avoided.ok) {
      throw new Error(avoided.error.message);
    }
    expect(
      avoided.route.segments.every((segment) => segment.roadClass === "primary"),
    ).toBe(true);
    expect(avoided.route.warnings).not.toContain(HIGHWAY_AVOIDANCE_WARNING);
  });

  it("signals when every reasonable destination uses a highway (FR-007)", async () => {
    const mock = new MockRoutingProvider();
    const provider: RoutingProvider = {
      async calculateRoute(input) {
        const routed = await mock.calculateRoute(input);
        return {
          ...routed,
          segments: routed.segments.map((segment) => ({
            ...segment,
            roadClass: "motorway",
            surface: "paved" as const,
          })),
        };
      },
    };

    const result = await generateDestinationRide(
      {
        type: "destination",
        start: GRANBY,
        destination: TREMBLANT,
        style: "touring",
        preferences: { avoidHighways: true, avoidUnpaved: false },
      },
      provider,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.segments[0]?.roadClass).toBe("motorway");
    expect(result.route.warnings).toContain(HIGHWAY_AVOIDANCE_WARNING);
  });
});
