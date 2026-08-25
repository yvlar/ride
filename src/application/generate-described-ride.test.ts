import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { filterViaPoints, generateDescribedRide } from "./generate-described-ride";
import { generateRide } from "./generate-ride";
import type {
  ProviderRouteRequest,
  RoutingProvider,
} from "@/infrastructure/routing/routing-provider";
import { createLoopWaypointSets } from "@/domain/ride/loop";
import type { AiRidePlanner } from "@/infrastructure/ai/ai-ride-planner";
import { AiRidePlannerError } from "@/infrastructure/ai/ai-ride-planner-error";
import type { WebSearchProvider } from "@/infrastructure/search/web-search-provider";
import { WebSearchError } from "@/infrastructure/search/web-search-error";
import { offsetCoordinates } from "@/domain/geo/distance";
import { createCircleLineString } from "@/domain/geo/geometry";
import type { Coordinates, LineString } from "@/domain/geo/types";
import { HIGHWAY_AVOIDANCE_WARNING } from "@/domain/ride/highways";
import { RoutingKnowledgeError } from "@/infrastructure/routing/routing-knowledge-error";
import {
  elongatedLoopCandidate,
  elongatedLoopVias,
  GeodesicRoutingProvider,
} from "@/test/geodesic-routing-provider";

const GRANBY = {
  label: "Position actuelle",
  coordinates: { latitude: 45.403, longitude: -72.734 },
};

const NAMED_HITS = [
  {
    id: "web-1",
    title: "Chemin des crêtes",
    snippet: "Twisty paved motorcycle road.",
  },
  {
    id: "web-2",
    title: "Belvédère de Bolton",
    snippet: "Village lookout and scenic stop.",
  },
];

function fakeSearch(): WebSearchProvider {
  return {
    async searchMotorcycleRoads() {
      return NAMED_HITS;
    },
  };
}

function fakePlanner(offset = 0): AiRidePlanner {
  return {
    async planLoop(input) {
      return {
        candidates: [
          elongatedLoopCandidate(
            input.origin,
            input.targetDistanceKm,
            offset,
          ),
          elongatedLoopCandidate(
            input.origin,
            input.targetDistanceKm,
            offset + 90,
          ),
          elongatedLoopCandidate(
            input.origin,
            input.targetDistanceKm,
            offset + 180,
          ),
        ],
      };
    },
  };
}

function line(points: Coordinates[]): LineString {
  return {
    type: "LineString",
    coordinates: points.map((point) => [point.longitude, point.latitude]),
  };
}

function densify(geometry: LineString, pointsPerSegment = 8): LineString {
  const coordinates: LineString["coordinates"] = [];
  for (let index = 0; index < geometry.coordinates.length - 1; index += 1) {
    const from = geometry.coordinates[index];
    const to = geometry.coordinates[index + 1];
    for (let step = 0; step < pointsPerSegment; step += 1) {
      const t = step / pointsPerSegment;
      coordinates.push([
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
      ]);
    }
  }
  coordinates.push(geometry.coordinates[geometry.coordinates.length - 1]);
  return { type: "LineString", coordinates };
}

function routingWith(
  geometry: LineString,
  distanceKm: number,
): RoutingProvider {
  return {
    async calculateRoute() {
      return {
        geometry,
        segments: [
          {
            id: "custom",
            geometry,
            distanceKm,
            durationMinutes: distanceKm,
            surface: "paved",
            roadClass: "secondary",
          },
        ],
        steps: [],
        distanceKm,
        durationMinutes: distanceKm,
      };
    },
  };
}

describe("generateDescribedRide (FR-034)", () => {
  it("requires both web search and the AI planner before routing (FR-011)", async () => {
    const search = fakeSearch();
    const planner = fakePlanner();
    const searchSpy = vi.spyOn(search, "searchMotorcycleRoads");
    const planSpy = vi.spyOn(planner, "planLoop");
    const routing = new GeodesicRoutingProvider();
    const routeSpy = vi.spyOn(routing, "calculateRoute");

    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        style: "scenic",
        preferences: { avoidHighways: true, avoidUnpaved: true },
        useAiWebGeneration: true,
        originAccuracyMeters: 8,
      },
      routing,
      undefined,
      { webSearch: search, planner },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(searchSpy).toHaveBeenCalled();
    expect(searchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ returnToStart: true }),
    );
    expect(planSpy).toHaveBeenCalled();
    expect(planSpy.mock.calls[0]?.[0]).toMatchObject({
      origin: GRANBY.coordinates,
      accuracyMeters: 8,
      targetDistanceKm: 80,
    });
    expect(routeSpy).toHaveBeenCalled();
    expect(result.route.geometry.coordinates.length).toBeGreaterThanOrEqual(8);
    expect(result.route.distanceKm).toBeGreaterThan(72);
    expect(result.route.distanceKm).toBeLessThan(88);
    expect(result.route).not.toHaveProperty("searchHits");
    expect(JSON.stringify(result.route)).not.toMatch(/DESCRIBE_LOOP_PLAN/);
    expect(JSON.stringify(result.route)).not.toMatch(/api\.tavily\.com/);
  });

  it("routes a one-way when returnToStart is false (FR-034, FR-002)", async () => {
    const search = fakeSearch();
    const vias = [
      offsetCoordinates(GRANBY.coordinates, 90, 40),
      offsetCoordinates(GRANBY.coordinates, 90, 78),
    ];
    const planner: AiRidePlanner = {
      async planLoop() {
        return {
          candidates: [
            {
              candidateName: "east one-way",
              viaPoints: [
                {
                  label: "Chemin des crêtes",
                  latitude: vias[0].latitude,
                  longitude: vias[0].longitude,
                  sourceResultIds: ["web-1"],
                },
                {
                  label: "Belvédère de Bolton",
                  latitude: vias[1].latitude,
                  longitude: vias[1].longitude,
                  sourceResultIds: ["web-2"],
                },
              ],
              roads: ["Chemin des crêtes"],
              pointsOfInterest: ["Belvédère de Bolton"],
            },
          ],
        };
      },
    };
    const planSpy = vi.spyOn(planner, "planLoop");
    const routing = new GeodesicRoutingProvider();
    const routeSpy = vi.spyOn(routing, "calculateRoute");

    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        style: "scenic",
        preferences: { avoidHighways: true, avoidUnpaved: true },
        useAiWebGeneration: true,
        returnToStart: false,
      },
      routing,
      undefined,
      { webSearch: search, planner },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.type).toBe("destination");
    expect(planSpy.mock.calls[0]?.[0].returnToStart).toBe(false);
    expect(routeSpy.mock.calls[0]?.[0].destination).toEqual(vias[1]);
    expect(routeSpy.mock.calls[0]?.[0].destination).not.toEqual(
      GRANBY.coordinates,
    );
    if (result.route.type !== "destination") {
      throw new Error("expected a destination route");
    }
    expect(result.route.destination.label).toBe("Arrivée proposée");
  });

  it("does not promote an intermediate via when the planned arrival is out of range (FR-034, BR-001)", async () => {
    const midpoint = offsetCoordinates(GRANBY.coordinates, 90, 40);
    const tooFar = offsetCoordinates(GRANBY.coordinates, 90, 200);
    const routing = new GeodesicRoutingProvider();
    const routeSpy = vi.spyOn(routing, "calculateRoute");
    const planner: AiRidePlanner = {
      async planLoop() {
        return {
          candidates: [
            {
              candidateName: "too far",
              viaPoints: [
                {
                  label: "Chemin des crêtes",
                  latitude: midpoint.latitude,
                  longitude: midpoint.longitude,
                  sourceResultIds: ["web-1"],
                },
                {
                  label: "Belvédère de Bolton",
                  latitude: tooFar.latitude,
                  longitude: tooFar.longitude,
                  sourceResultIds: ["web-2"],
                },
              ],
              roads: ["Chemin des crêtes"],
              pointsOfInterest: ["Belvédère de Bolton"],
            },
          ],
        };
      },
    };

    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        useAiWebGeneration: true,
        returnToStart: false,
      },
      routing,
      undefined,
      {
        webSearch: fakeSearch(),
        planner,
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("NO_ROUTE_FOUND");
    for (const call of routeSpy.mock.calls) {
      expect(call[0].destination).not.toEqual(midpoint);
    }
  });

  it("regenerates a destination request through the AI one-way pipeline (FR-012, FR-034)", async () => {
    const arrival = offsetCoordinates(GRANBY.coordinates, 0, 78);
    const vias = [
      offsetCoordinates(GRANBY.coordinates, 90, 40),
      offsetCoordinates(GRANBY.coordinates, 90, 78),
    ];
    const planner: AiRidePlanner = {
      async planLoop() {
        return {
          candidates: [
            {
              candidateName: "east",
              viaPoints: [
                {
                  label: "Chemin des crêtes",
                  latitude: vias[0].latitude,
                  longitude: vias[0].longitude,
                  sourceResultIds: ["web-1"],
                },
                {
                  label: "Belvédère de Bolton",
                  latitude: vias[1].latitude,
                  longitude: vias[1].longitude,
                  sourceResultIds: ["web-2"],
                },
              ],
              roads: ["Chemin des crêtes"],
              pointsOfInterest: ["Belvédère de Bolton"],
            },
          ],
        };
      },
    };
    const planSpy = vi.spyOn(planner, "planLoop");
    const routing = new GeodesicRoutingProvider();
    const routeSpy = vi.spyOn(routing, "calculateRoute");

    const result = await generateDescribedRide(
      {
        type: "destination",
        start: GRANBY,
        destination: {
          label: "Arrivée proposée",
          coordinates: arrival,
        },
        targetDistanceKm: 80,
        style: "scenic",
        preferences: { avoidHighways: true, avoidUnpaved: true },
        useAiWebGeneration: true,
      },
      routing,
      undefined,
      { webSearch: fakeSearch(), planner },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.type).toBe("destination");
    expect(planSpy.mock.calls[0]?.[0].returnToStart).toBe(false);
    expect(routeSpy.mock.calls[0]?.[0].destination).toEqual(vias[1]);
    expect(routeSpy.mock.calls[0]?.[0].destination).not.toEqual(arrival);
  });

  it("still plans a one-way when GPS is near the previous arrival (FR-012, FR-034)", async () => {
    const nearStart = {
      label: "Arrivée proposée",
      coordinates: offsetCoordinates(GRANBY.coordinates, 0, 0.2),
    };
    const vias = [
      offsetCoordinates(GRANBY.coordinates, 90, 40),
      offsetCoordinates(GRANBY.coordinates, 90, 78),
    ];
    const planner: AiRidePlanner = {
      async planLoop() {
        return {
          candidates: [
            {
              candidateName: "east",
              viaPoints: [
                {
                  label: "Chemin des crêtes",
                  latitude: vias[0].latitude,
                  longitude: vias[0].longitude,
                  sourceResultIds: ["web-1"],
                },
                {
                  label: "Belvédère de Bolton",
                  latitude: vias[1].latitude,
                  longitude: vias[1].longitude,
                  sourceResultIds: ["web-2"],
                },
              ],
              roads: ["Chemin des crêtes"],
              pointsOfInterest: ["Belvédère de Bolton"],
            },
          ],
        };
      },
    };

    const result = await generateDescribedRide(
      {
        type: "destination",
        start: GRANBY,
        destination: nearStart,
        targetDistanceKm: 80,
        style: "scenic",
        useAiWebGeneration: true,
      },
      new GeodesicRoutingProvider(),
      undefined,
      { webSearch: fakeSearch(), planner },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.type).toBe("destination");
  });

  it("retries the AI planner when the first via-points cannot be used (FR-034)", async () => {
    const planner: AiRidePlanner = {
      async planLoop(input) {
        if (!input.previousPlanningFailure) {
          return {
            candidates: [
              {
                candidateName: "too close",
                viaPoints: [
                  {
                    label: "Chemin des crêtes",
                    latitude: offsetCoordinates(GRANBY.coordinates, 0, 0.05).latitude,
                    longitude: offsetCoordinates(GRANBY.coordinates, 0, 0.05).longitude,
                    sourceResultIds: ["web-1"],
                  },
                  {
                    label: "Belvédère de Bolton",
                    latitude: offsetCoordinates(GRANBY.coordinates, 90, 0.08).latitude,
                    longitude: offsetCoordinates(GRANBY.coordinates, 90, 0.08).longitude,
                    sourceResultIds: ["web-2"],
                  },
                ],
                roads: ["Chemin des crêtes"],
                pointsOfInterest: ["Belvédère de Bolton"],
              },
            ],
          };
        }
        return {
          candidates: [
            elongatedLoopCandidate(input.origin, input.targetDistanceKm),
          ],
        };
      },
    };
    const planSpy = vi.spyOn(planner, "planLoop");

    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        useAiWebGeneration: true,
      },
      new GeodesicRoutingProvider(),
      undefined,
      { webSearch: fakeSearch(), planner },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(planSpy).toHaveBeenCalledTimes(2);
    expect(planSpy.mock.calls[1]?.[0].previousPlanningFailure?.reason).toBe(
      "unusable_via_points",
    );
  });

  it("never returns a 32 km ride as ok for a 300 km request (BR-001)", async () => {
    const origin = GRANBY.coordinates;
    const short = densify(
      line([
        origin,
        offsetCoordinates(origin, 0, 6),
        offsetCoordinates(origin, 90, 10),
        origin,
      ]),
    );
    const planner: AiRidePlanner = {
      async planLoop() {
        return {
          candidates: [elongatedLoopCandidate(origin, 300)],
        };
      },
    };
    const planSpy = vi.spyOn(planner, "planLoop");

    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 300,
        useAiWebGeneration: true,
      },
      routingWith(short, 32),
      undefined,
      { webSearch: fakeSearch(), planner },
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("NO_ROUTE_FOUND");
    expect(result.error.bestCandidate?.distanceKm).toBe(32);
    expect(result.error.bestCandidate?.violations).toContain(
      "distance_too_short",
    );
    expect(planSpy.mock.calls.length).toBeGreaterThan(1);
    expect(planSpy.mock.calls[1]?.[0].previousPlanningFailure).toMatchObject({
      reason: "distance_too_short",
      actualDistanceKm: 32,
      targetDistanceKm: 300,
      minimumDistanceKm: 270,
    });
  });

  it("rejects a 200 km loop that stays within 40 km of the origin (BR-010)", async () => {
    const origin = GRANBY.coordinates;
    const tight = densify(
      line([
        origin,
        offsetCoordinates(origin, 0, 28),
        offsetCoordinates(offsetCoordinates(origin, 0, 28), 90, 22),
        offsetCoordinates(origin, 90, 22),
        origin,
      ]),
    );
    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 200,
        useAiWebGeneration: true,
      },
      routingWith(tight, 200),
      undefined,
      { webSearch: fakeSearch(), planner: fakePlanner() },
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("NO_ROUTE_FOUND");
    expect(result.error.bestCandidate?.violations).toContain(
      "insufficient_spread",
    );
    expect(result.error.bestCandidate?.maxDistanceFromOriginKm).toBeLessThan(40);
  });

  it("rejects an in-range loop that retraces the same corridor (BR-011)", async () => {
    const origin = GRANBY.coordinates;
    const far = offsetCoordinates(origin, 90, 50);
    const outAndBack = densify(line([origin, far, origin]));
    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 100,
        useAiWebGeneration: true,
      },
      routingWith(outAndBack, 100),
      undefined,
      { webSearch: fakeSearch(), planner: fakePlanner() },
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.bestCandidate?.violations).toContain("repeated_road");
  });

  it("allows a short shared connector within 1 km of the origin (BR-011)", async () => {
    const origin = GRANBY.coordinates;
    const connector = offsetCoordinates(origin, 0, 0.5);
    const north = offsetCoordinates(origin, 0, 45);
    const northEast = offsetCoordinates(north, 90, 55);
    const east = offsetCoordinates(origin, 90, 55);
    const withConnector = densify(
      line([origin, connector, north, northEast, east, connector, origin]),
    );
    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 200,
        useAiWebGeneration: true,
      },
      routingWith(withConnector, 200),
      undefined,
      { webSearch: fakeSearch(), planner: fakePlanner() },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`${result.error.code}: ${result.error.message}`);
    }
    expect(result.route.type).toBe("loop");
    if (result.route.type !== "loop") {
      return;
    }
    expect(result.route.statistics.repeatedRoadPercent).toBeGreaterThanOrEqual(0);
  });

  it("accepts a loop in tolerance, far enough, and without material overlap", async () => {
    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        useAiWebGeneration: true,
      },
      new GeodesicRoutingProvider(),
      undefined,
      { webSearch: fakeSearch(), planner: fakePlanner() },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`${result.error.code}: ${result.error.message}`);
    }
    expect(result.route.distanceKm).toBeGreaterThan(72);
    expect(result.route.distanceKm).toBeLessThan(88);
  });

  it("sends actual distance after a too-short candidate so the planner expands (FR-034)", async () => {
    const origin = GRANBY.coordinates;
    const short = densify(
      line([
        origin,
        offsetCoordinates(origin, 0, 6),
        offsetCoordinates(origin, 90, 10),
        origin,
      ]),
    );
    let round = 0;
    const planner: AiRidePlanner = {
      async planLoop(input) {
        round += 1;
        if (round === 1) {
          return { candidates: [elongatedLoopCandidate(origin, 80)] };
        }
        expect(input.previousPlanningFailure?.reason).toBe("distance_too_short");
        expect(input.previousPlanningFailure?.actualDistanceKm).toBe(32);
        return {
          candidates: [elongatedLoopCandidate(origin, input.targetDistanceKm)],
        };
      },
    };
    const routing: RoutingProvider = {
      async calculateRoute() {
        if (round === 1) {
          return {
            geometry: short,
            segments: [
              {
                id: "short",
                geometry: short,
                distanceKm: 32,
                durationMinutes: 32,
                surface: "paved",
                roadClass: "secondary",
              },
            ],
            steps: [],
            distanceKm: 32,
            durationMinutes: 32,
          };
        }
        return new GeodesicRoutingProvider().calculateRoute({
          start: origin,
          destination: origin,
          waypoints: elongatedLoopVias(origin, 300),
        });
      },
    };

    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 300,
        useAiWebGeneration: true,
      },
      routing,
      undefined,
      { webSearch: fakeSearch(), planner },
    );

    expect(round).toBeGreaterThan(1);
    expect(result.ok).toBe(true);
  });

  it("sends repeated-road percent so the planner proposes a different return (BR-011)", async () => {
    const origin = GRANBY.coordinates;
    const far = offsetCoordinates(origin, 90, 40);
    const outAndBack = densify(line([origin, far, origin]));
    let round = 0;
    const planner: AiRidePlanner = {
      async planLoop(input) {
        round += 1;
        if (round === 1) {
          return { candidates: [elongatedLoopCandidate(origin, 80)] };
        }
        expect(input.previousPlanningFailure?.reason).toBe("repeated_road");
        expect(
          input.previousPlanningFailure?.repeatedRoadPercent,
        ).toBeGreaterThan(2);
        expect(input.previousPlanningFailure?.instruction).toMatch(/unused roads/i);
        return {
          candidates: [elongatedLoopCandidate(origin, 80, 20)],
        };
      },
    };
    const routing: RoutingProvider = {
      async calculateRoute() {
        if (round === 1) {
          return {
            geometry: outAndBack,
            segments: [
              {
                id: "repeat",
                geometry: outAndBack,
                distanceKm: 80,
                durationMinutes: 80,
                surface: "paved",
                roadClass: "secondary",
              },
            ],
            steps: [],
            distanceKm: 80,
            durationMinutes: 80,
          };
        }
        return new GeodesicRoutingProvider().calculateRoute({
          start: origin,
          destination: origin,
          waypoints: elongatedLoopVias(origin, 80, 20),
        });
      },
    };

    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        useAiWebGeneration: true,
      },
      routing,
      undefined,
      { webSearch: fakeSearch(), planner },
    );

    expect(round).toBeGreaterThan(1);
    expect(result.ok).toBe(true);
  });

  it("reuses web hits when correcting a repeated-road plan (FR-034, BR-011)", async () => {
    const origin = GRANBY.coordinates;
    const far = offsetCoordinates(origin, 90, 40);
    const outAndBack = densify(line([origin, far, origin]));
    let round = 0;
    const search = fakeSearch();
    const searchSpy = vi.spyOn(search, "searchMotorcycleRoads");
    const planner: AiRidePlanner = {
      async planLoop(input) {
        round += 1;
        if (round === 1) {
          return { candidates: [elongatedLoopCandidate(origin, 80)] };
        }
        expect(input.previousPlanningFailure?.reason).toBe("repeated_road");
        expect(input.searchHits).toEqual(NAMED_HITS);
        return {
          candidates: [elongatedLoopCandidate(origin, 80, 20)],
        };
      },
    };
    const routing: RoutingProvider = {
      async calculateRoute() {
        if (round === 1) {
          return {
            geometry: outAndBack,
            segments: [
              {
                id: "repeat",
                geometry: outAndBack,
                distanceKm: 80,
                durationMinutes: 80,
                surface: "paved",
                roadClass: "secondary",
              },
            ],
            steps: [],
            distanceKm: 80,
            durationMinutes: 80,
          };
        }
        return new GeodesicRoutingProvider().calculateRoute({
          start: origin,
          destination: origin,
          waypoints: elongatedLoopVias(origin, 80, 20),
        });
      },
    };

    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        useAiWebGeneration: true,
      },
      routing,
      undefined,
      { webSearch: search, planner },
    );

    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(round).toBe(2);
    expect(result.ok).toBe(true);
  });

  it("runs an expanded search after unroutable first points (FR-034)", async () => {
    let searchRound = 0;
    const search: WebSearchProvider = {
      async searchMotorcycleRoads(input) {
        searchRound += 1;
        if (searchRound > 1) {
          expect(input.searchRadiusKm).toBeGreaterThan(40);
          expect(input.corridorHint).not.toBe("north-east");
        }
        return NAMED_HITS;
      },
    };
    let planRound = 0;
    const planner: AiRidePlanner = {
      async planLoop(input) {
        planRound += 1;
        if (planRound === 1) {
          return {
            candidates: [
              {
                candidateName: "unroutable",
                viaPoints: [
                  {
                    label: "Chemin des crêtes",
                    latitude: 45.5,
                    longitude: -72.7,
                    sourceResultIds: ["web-1"],
                  },
                  {
                    label: "Belvédère de Bolton",
                    latitude: 45.3,
                    longitude: -72.5,
                    sourceResultIds: ["web-2"],
                  },
                ],
                roads: ["Chemin des crêtes"],
                pointsOfInterest: ["Belvédère de Bolton"],
              },
            ],
          };
        }
        expect(input.previousPlanningFailure?.reason).toMatch(
          /unroutable|routing/,
        );
        return {
          candidates: [
            elongatedLoopCandidate(GRANBY.coordinates, input.targetDistanceKm),
          ],
        };
      },
    };
    const routing: RoutingProvider = {
      async calculateRoute(input) {
        if (planRound === 1) {
          throw new RoutingKnowledgeError(
            "disconnected",
            "Le réseau routier ne permet pas de relier les points demandés (FR-021).",
            [],
          );
        }
        return new GeodesicRoutingProvider().calculateRoute(input);
      },
    };

    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        useAiWebGeneration: true,
      },
      routing,
      undefined,
      { webSearch: search, planner },
    );

    expect(searchRound).toBeGreaterThan(1);
    expect(result.ok).toBe(true);
  });

  it("keeps JSON waypoint latitude/longitude and GeoJSON [longitude, latitude]", async () => {
    const planner = fakePlanner();
    const planSpy = vi.spyOn(planner, "planLoop");
    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        useAiWebGeneration: true,
      },
      new GeodesicRoutingProvider(),
      undefined,
      { webSearch: fakeSearch(), planner },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    const via = planSpy.mock.calls[0]?.[0];
    expect(JSON.stringify(via?.origin)).toMatch(/"latitude":/);
    expect(JSON.stringify(via?.origin)).toMatch(/"longitude":/);
    const first = result.route.geometry.coordinates[0];
    expect(first?.[0]).toBeCloseTo(GRANBY.coordinates.longitude, 3);
    expect(first?.[1]).toBeCloseTo(GRANBY.coordinates.latitude, 3);
  });

  it("does not add GPX or TomTom to the described-ride pipeline", () => {
    const files = [
      "src/application/generate-described-ride.ts",
      "src/infrastructure/ai/http-ai-ride-planner.ts",
      "src/infrastructure/ai/ai-ride-planner.ts",
      "src/domain/ride/ai-route.ts",
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8").toLowerCase();
      expect(source).not.toMatch(/gpx/);
      expect(source).not.toMatch(/tomtom/);
    }
  });

  it("does not return an unclosed path as a described loop (FR-001, FR-034)", async () => {
    const openGeometry = densify(
      line([
        GRANBY.coordinates,
        offsetCoordinates(GRANBY.coordinates, 90, 20),
        offsetCoordinates(GRANBY.coordinates, 90, 40),
      ]),
    );
    const routing: RoutingProvider = {
      async calculateRoute() {
        return {
          geometry: openGeometry,
          segments: [
            {
              id: "open",
              geometry: openGeometry,
              distanceKm: 80,
              durationMinutes: 80,
              surface: "paved",
            },
          ],
          steps: [],
          distanceKm: 80,
          durationMinutes: 80,
        };
      },
    };

    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        useAiWebGeneration: true,
      },
      routing,
      undefined,
      { webSearch: fakeSearch(), planner: fakePlanner() },
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("NO_ROUTE_FOUND");
  });

  it("rejects a leaked known unpaved described ride when avoidance is on (FR-008, FR-034)", async () => {
    const mock = new GeodesicRoutingProvider();
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

    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        useAiWebGeneration: true,
        preferences: { avoidHighways: false, avoidUnpaved: true },
      },
      leaky,
      undefined,
      { webSearch: fakeSearch(), planner: fakePlanner() },
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("NO_ROUTE_FOUND");
    expect(result.error.message).toMatch(/non pavées|contraintes/);
  });

  it("does not discard a valid route when another waypoint order hits known unpaved (FR-008, FR-034)", async () => {
    let calls = 0;
    const geodesic = new GeodesicRoutingProvider();
    const mixed: RoutingProvider = {
      async calculateRoute(input: ProviderRouteRequest) {
        calls += 1;
        const leakThisOrder = calls === 1;
        const routed = await geodesic.calculateRoute({
          ...input,
          preferences: undefined,
        });
        if (!leakThisOrder) {
          return routed;
        }
        return {
          ...routed,
          segments: routed.segments.map((segment) => ({
            ...segment,
            surface: "unpaved" as const,
          })),
        };
      },
    };

    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        useAiWebGeneration: true,
        preferences: { avoidHighways: false, avoidUnpaved: true },
      },
      mixed,
      undefined,
      { webSearch: fakeSearch(), planner: fakePlanner() },
    );

    expect(calls).toBeGreaterThan(1);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`${result.error.code}: ${result.error.message}`);
    }
    expect(result.route.distanceKm).toBeGreaterThan(72);
    expect(result.route.distanceKm).toBeLessThan(88);
  });

  it("retries the planner with unpaved_rejected instead of aborting the loop (FR-008, FR-034)", async () => {
    const origin = GRANBY.coordinates;
    let round = 0;
    const geodesic = new GeodesicRoutingProvider();
    const planner: AiRidePlanner = {
      async planLoop(input) {
        round += 1;
        if (round === 1) {
          return { candidates: [elongatedLoopCandidate(origin, 80)] };
        }
        expect(input.previousPlanningFailure?.reason).toBe("unpaved_rejected");
        expect(input.previousPlanningFailure?.instruction).toMatch(/paved/i);
        return { candidates: [elongatedLoopCandidate(origin, 80, 20)] };
      },
    };
    const routing: RoutingProvider = {
      async calculateRoute(input) {
        const routed = await geodesic.calculateRoute({
          ...input,
          preferences: undefined,
        });
        if (round === 1) {
          return {
            ...routed,
            segments: routed.segments.map((segment) => ({
              ...segment,
              surface: "unpaved" as const,
            })),
          };
        }
        return routed;
      },
    };

    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        useAiWebGeneration: true,
        preferences: { avoidHighways: false, avoidUnpaved: true },
      },
      routing,
      undefined,
      { webSearch: fakeSearch(), planner },
    );

    expect(round).toBeGreaterThan(1);
    expect(result.ok).toBe(true);
  });

  it("tells the planner when candidates are not grounded in web results (FR-034)", async () => {
    const origin = GRANBY.coordinates;
    let round = 0;
    const planner: AiRidePlanner = {
      async planLoop(input) {
        round += 1;
        if (round === 1) {
          return {
            candidates: [
              {
                candidateName: "ungrounded",
                viaPoints: [
                  {
                    label: "Random field",
                    latitude: offsetCoordinates(origin, 0, 18).latitude,
                    longitude: offsetCoordinates(origin, 0, 18).longitude,
                    sourceResultIds: [],
                  },
                  {
                    label: "Another field",
                    latitude: offsetCoordinates(origin, 90, 22).latitude,
                    longitude: offsetCoordinates(origin, 90, 22).longitude,
                    sourceResultIds: [],
                  },
                  {
                    label: "Third field",
                    latitude: offsetCoordinates(origin, 45, 20).latitude,
                    longitude: offsetCoordinates(origin, 45, 20).longitude,
                    sourceResultIds: [],
                  },
                ],
                roads: ["Invented corridor"],
                pointsOfInterest: ["Made-up lookout"],
              },
            ],
          };
        }
        expect(input.previousPlanningFailure?.reason).toBe(
          "insufficient_web_grounding",
        );
        return {
          candidates: [elongatedLoopCandidate(origin, input.targetDistanceKm)],
        };
      },
    };

    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        useAiWebGeneration: true,
      },
      new GeodesicRoutingProvider(),
      undefined,
      { webSearch: fakeSearch(), planner },
    );

    expect(round).toBeGreaterThan(1);
    expect(result.ok).toBe(true);
  });

  it("retries after a geometric loop instead of treating it as routing unavailable (FR-001, FR-034)", async () => {
    const origin = GRANBY.coordinates;
    const circle = createCircleLineString(
      offsetCoordinates(origin, 90, 12),
      12,
      36,
      270,
    );
    let round = 0;
    const planner: AiRidePlanner = {
      async planLoop(input) {
        round += 1;
        if (round === 1) {
          return { candidates: [elongatedLoopCandidate(origin, 80)] };
        }
        expect(input.previousPlanningFailure?.reason).toBe(
          "geometric_loop_rejected",
        );
        return {
          candidates: [elongatedLoopCandidate(origin, input.targetDistanceKm)],
        };
      },
    };
    const routing: RoutingProvider = {
      async calculateRoute(input) {
        if (round === 1) {
          return {
            geometry: circle,
            segments: [
              {
                id: "circle",
                geometry: circle,
                distanceKm: 75,
                durationMinutes: 75,
                surface: "paved",
                roadClass: "secondary",
              },
            ],
            steps: [],
            distanceKm: 75,
            durationMinutes: 75,
          };
        }
        return new GeodesicRoutingProvider().calculateRoute(input);
      },
    };

    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        useAiWebGeneration: true,
      },
      routing,
      undefined,
      { webSearch: fakeSearch(), planner },
    );

    expect(round).toBeGreaterThan(1);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      expect(result.error.code).not.toBe("ROUTING_UNAVAILABLE");
    }
  });

  it("keeps the best candidate when a later round is a knowledge rejection (FR-034)", async () => {
    const origin = GRANBY.coordinates;
    const short = densify(
      line([
        origin,
        offsetCoordinates(origin, 0, 6),
        offsetCoordinates(origin, 90, 10),
        origin,
      ]),
    );
    let round = 0;
    const geodesic = new GeodesicRoutingProvider();
    const planner: AiRidePlanner = {
      async planLoop() {
        round += 1;
        return { candidates: [elongatedLoopCandidate(origin, 300)] };
      },
    };
    const routing: RoutingProvider = {
      async calculateRoute(input) {
        if (round === 1) {
          return {
            geometry: short,
            segments: [
              {
                id: "short",
                geometry: short,
                distanceKm: 32,
                durationMinutes: 32,
                surface: "paved",
                roadClass: "secondary",
              },
            ],
            steps: [],
            distanceKm: 32,
            durationMinutes: 32,
          };
        }
        const routed = await geodesic.calculateRoute({
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

    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 300,
        useAiWebGeneration: true,
        preferences: { avoidHighways: false, avoidUnpaved: true },
      },
      routing,
      undefined,
      { webSearch: fakeSearch(), planner },
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("NO_ROUTE_FOUND");
    expect(result.error.bestCandidate?.distanceKm).toBe(32);
    expect(result.error.bestCandidate?.violations).toContain(
      "distance_too_short",
    );
  });

  it("returns an otherwise valid trunk loop with an autoroute warning (FR-007, FR-034)", async () => {
    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        style: "scenic",
        preferences: { avoidHighways: true, avoidUnpaved: true },
        useAiWebGeneration: true,
      },
      new GeodesicRoutingProvider({ roadClass: "trunk" }),
      undefined,
      { webSearch: fakeSearch(), planner: fakePlanner() },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.warnings).toContain(HIGHWAY_AVOIDANCE_WARNING);
    expect(result.route.distanceKm).toBeGreaterThan(72);
    expect(result.route.distanceKm).toBeLessThan(88);
  });

  it("prefers a highway-free valid loop when avoidHighways is on (FR-007)", async () => {
    const geodesic = new GeodesicRoutingProvider();
    const trunkVias = elongatedLoopVias(GRANBY.coordinates, 80, 0);
    const routing: RoutingProvider = {
      async calculateRoute(input) {
        const routed = await geodesic.calculateRoute(input);
        const first = input.waypoints?.[0];
        const trunkOrigin = trunkVias[0];
        const usesTrunk =
          first !== undefined &&
          trunkOrigin !== undefined &&
          Math.abs(first.latitude - trunkOrigin.latitude) < 1e-6 &&
          Math.abs(first.longitude - trunkOrigin.longitude) < 1e-6;
        return {
          ...routed,
          segments: routed.segments.map((segment) => ({
            ...segment,
            roadClass: usesTrunk ? "trunk" : "secondary",
          })),
        };
      },
    };
    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        preferences: { avoidHighways: true, avoidUnpaved: true },
        useAiWebGeneration: true,
      },
      routing,
      undefined,
      {
        webSearch: fakeSearch(),
        planner: {
          async planLoop() {
            return {
              candidates: [
                elongatedLoopCandidate(GRANBY.coordinates, 80, 0),
                elongatedLoopCandidate(GRANBY.coordinates, 80, 90),
              ],
            };
          },
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.warnings).toEqual([]);
  });

  it("does not route extra waypoint orders when the AI order is already valid (FR-034)", async () => {
    const routing = new GeodesicRoutingProvider();
    const routeSpy = vi.spyOn(routing, "calculateRoute");
    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        useAiWebGeneration: true,
      },
      routing,
      undefined,
      { webSearch: fakeSearch(), planner: fakePlanner() },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(routeSpy).toHaveBeenCalledTimes(3);
  });

  it("does not start another planning round when remaining time is too low (FR-034)", async () => {
    let currentMs = 0;
    const planner: AiRidePlanner = {
      async planLoop(input) {
        currentMs = 50_000;
        return {
          candidates: [elongatedLoopCandidate(input.origin, 20)],
        };
      },
    };
    const planSpy = vi.spyOn(planner, "planLoop");
    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        useAiWebGeneration: true,
      },
      new GeodesicRoutingProvider(),
      undefined,
      {
        webSearch: fakeSearch(),
        planner,
        now: () => currentMs,
        deadlineMs: 55_000,
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("NO_ROUTE_FOUND");
    expect(planSpy).toHaveBeenCalledTimes(1);
  });

  it("does not fall back to geometric loop seeds when AI is required", async () => {
    const geometric = createLoopWaypointSets(GRANBY.coordinates, 80);
    const routing = new GeodesicRoutingProvider();
    const routeSpy = vi.spyOn(routing, "calculateRoute");

    await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        useAiWebGeneration: true,
      },
      routing,
      undefined,
      { webSearch: fakeSearch(), planner: fakePlanner() },
    );

    const used = routeSpy.mock.calls[0]?.[0].waypoints ?? [];
    expect(used).toEqual(elongatedLoopVias(GRANBY.coordinates, 80));
    expect(used).not.toEqual(geometric[0]?.waypoints);
  });

  it("evaluates the AI riding order before any optimized extra candidate", async () => {
    const north = offsetCoordinates(GRANBY.coordinates, 0, 18);
    const south = offsetCoordinates(GRANBY.coordinates, 180, 18);
    const east = offsetCoordinates(GRANBY.coordinates, 90, 22);
    const routing = new GeodesicRoutingProvider();
    const routeSpy = vi.spyOn(routing, "calculateRoute");

    await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        useAiWebGeneration: true,
      },
      routing,
      undefined,
      {
        webSearch: fakeSearch(),
        planner: {
          async planLoop() {
            return {
              candidates: [
                {
                  candidateName: "crossed",
                  viaPoints: [
                    {
                      label: "Chemin des crêtes",
                      latitude: north.latitude,
                      longitude: north.longitude,
                      sourceResultIds: ["web-1"],
                    },
                    {
                      label: "Belvédère de Bolton",
                      latitude: south.latitude,
                      longitude: south.longitude,
                      sourceResultIds: ["web-2"],
                    },
                    {
                      label: "Village d’Eastman",
                      latitude: east.latitude,
                      longitude: east.longitude,
                      sourceResultIds: ["web-1"],
                    },
                  ],
                  roads: ["Chemin des crêtes"],
                  pointsOfInterest: ["Belvédère de Bolton"],
                },
              ],
            };
          },
        },
      },
    );

    expect(routeSpy.mock.calls[0]?.[0].waypoints).toEqual([north, south, east]);
  });

  it("returns WEB_SEARCH_UNAVAILABLE without calling a non-AI generator", async () => {
    const routing = new GeodesicRoutingProvider();
    const routeSpy = vi.spyOn(routing, "calculateRoute");
    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        useAiWebGeneration: true,
      },
      routing,
      undefined,
      {
        webSearch: {
          async searchMotorcycleRoads() {
            throw new WebSearchError("La recherche Web est indisponible.");
          },
        },
        planner: fakePlanner(),
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("WEB_SEARCH_UNAVAILABLE");
    expect(routeSpy).not.toHaveBeenCalled();
  });

  it("retries search when the first successful search returns no hits", async () => {
    let searchRound = 0;
    const planner = fakePlanner();
    const planSpy = vi.spyOn(planner, "planLoop");
    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        useAiWebGeneration: true,
      },
      new GeodesicRoutingProvider(),
      undefined,
      {
        webSearch: {
          async searchMotorcycleRoads() {
            searchRound += 1;
            if (searchRound === 1) {
              return [];
            }
            return NAMED_HITS;
          },
        },
        planner,
      },
    );

    expect(searchRound).toBeGreaterThan(1);
    expect(planSpy.mock.calls.some((call) => call[0].searchHits.length > 0)).toBe(
      true,
    );
    expect(result.ok).toBe(true);
  });

  it("returns AI_UNAVAILABLE when the model fails after a successful search", async () => {
    const search = fakeSearch();
    const searchSpy = vi.spyOn(search, "searchMotorcycleRoads");
    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        useAiWebGeneration: true,
      },
      new GeodesicRoutingProvider(),
      undefined,
      {
        webSearch: search,
        planner: {
          async planLoop() {
            throw new AiRidePlannerError("Le service d’IA est indisponible.");
          },
        },
      },
    );

    expect(searchSpy).toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("AI_UNAVAILABLE");
  });

  it("returns ROUTING_UNAVAILABLE when the road network fails after AI planning", async () => {
    const routing = {
      async calculateRoute() {
        throw new Error("osrm down");
      },
    };
    const result = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        useAiWebGeneration: true,
      },
      routing,
      undefined,
      { webSearch: fakeSearch(), planner: fakePlanner() },
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("ROUTING_UNAVAILABLE");
  });

  it("passes the previous signature so regeneration can differ (FR-012, BR-006)", async () => {
    const planner = fakePlanner(40);
    const planSpy = vi.spyOn(planner, "planLoop");
    const first = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        useAiWebGeneration: true,
      },
      new GeodesicRoutingProvider(),
      undefined,
      { webSearch: fakeSearch(), planner: fakePlanner() },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const second = await generateDescribedRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        useAiWebGeneration: true,
        previousRouteSignature: first.route.id,
      },
      new GeodesicRoutingProvider(),
      { previousGeometry: first.route.geometry },
      { webSearch: fakeSearch(), planner },
    );

    expect(planSpy.mock.calls[0]?.[0].previousRouteSignature).toBe(first.route.id);
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    expect(second.route.id).not.toBe(first.route.id);
  });
});

describe("generateRide described flag (FR-034)", () => {
  it("uses the AI web pipeline when useAiWebGeneration is true", async () => {
    const result = await generateRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        style: "scenic",
        useAiWebGeneration: true,
        originAccuracyMeters: 10,
      },
      new GeodesicRoutingProvider(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.type).toBe("loop");
    expect(result.route.geometry.coordinates.length).toBeGreaterThanOrEqual(8);
  });

  it("uses the AI one-way pipeline for a destination describe regenerate (FR-012, FR-034)", async () => {
    const result = await generateRide(
      {
        type: "destination",
        start: GRANBY,
        destination: {
          label: "Arrivée proposée",
          coordinates: offsetCoordinates(GRANBY.coordinates, 90, 80),
        },
        targetDistanceKm: 80,
        style: "scenic",
        useAiWebGeneration: true,
      },
      new GeodesicRoutingProvider(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.type).toBe("destination");
  });

  it("keeps the non-AI loop generator when the flag is absent", async () => {
    const result = await generateRide({
      type: "loop",
      start: GRANBY,
      targetDistanceKm: 80,
    });
    expect(result.ok).toBe(true);
  });
});

describe("filterViaPoints (FR-034)", () => {
  it("keeps the planned one-way arrival last instead of promoting a closer via", () => {
    const midpoint = offsetCoordinates(GRANBY.coordinates, 90, 40);
    const arrival = offsetCoordinates(GRANBY.coordinates, 90, 78);
    const tooFar = offsetCoordinates(GRANBY.coordinates, 90, 120);

    expect(
      filterViaPoints(GRANBY.coordinates, 80, [midpoint, tooFar], {
        returnToStart: false,
      }),
    ).toEqual([]);
    expect(
      filterViaPoints(GRANBY.coordinates, 80, [tooFar, arrival], {
        returnToStart: false,
      }),
    ).toEqual([arrival]);
    expect(
      filterViaPoints(GRANBY.coordinates, 80, [midpoint, arrival], {
        returnToStart: false,
      }),
    ).toEqual([midpoint, arrival]);
    expect(
      filterViaPoints(GRANBY.coordinates, 80, [midpoint, tooFar], {
        returnToStart: false,
        mode: "planned",
      }),
    ).toEqual([midpoint, tooFar]);
  });

  it("removes duplicate loop points that would cause a U-turn", () => {
    const north = offsetCoordinates(GRANBY.coordinates, 0, 20);
    const almostNorth = offsetCoordinates(north, 90, 0.1);
    const east = offsetCoordinates(GRANBY.coordinates, 90, 20);

    expect(
      filterViaPoints(GRANBY.coordinates, 80, [north, almostNorth, east], {
        returnToStart: true,
      }),
    ).toEqual([north, east]);
  });
});
