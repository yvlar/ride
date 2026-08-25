import { describe, expect, it, vi } from "vitest";
import { generateDescribedRide } from "./generate-described-ride";
import { generateRide } from "./generate-ride";
import { MockRoutingProvider } from "@/infrastructure/routing/mock-routing-provider";
import { createLoopWaypointSets } from "@/domain/ride/loop";
import type { AiRidePlanner } from "@/infrastructure/ai/ai-ride-planner";
import { AiRidePlannerError } from "@/infrastructure/ai/ai-ride-planner-error";
import type { WebSearchProvider } from "@/infrastructure/search/web-search-provider";
import { WebSearchError } from "@/infrastructure/search/web-search-error";
import { offsetCoordinates } from "@/domain/geo/distance";

const GRANBY = {
  label: "Position actuelle",
  coordinates: { latitude: 45.403, longitude: -72.734 },
};

function viaPointsFor(distanceKm: number, offset = 0) {
  const radiusKm = distanceKm / 8;
  return [0, 90, 180, 270].map((bearing) =>
    offsetCoordinates(GRANBY.coordinates, bearing + offset, radiusKm),
  );
}

function fakeSearch(): WebSearchProvider {
  return {
    async searchMotorcycleRoads() {
      return [
        {
          title: "Scenic motorcycle roads",
          snippet: "Twisty paved routes.",
        },
      ];
    },
  };
}

function fakePlanner(offset = 0): AiRidePlanner {
  return {
    async planLoop(input) {
      return {
        viaPoints: viaPointsFor(input.targetDistanceKm, offset),
        roads: ["Chemin des crêtes"],
        pointsOfInterest: ["Belvédère"],
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
    const routing = new MockRoutingProvider();
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
    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(planSpy).toHaveBeenCalledTimes(1);
    expect(planSpy.mock.calls[0]?.[0]).toMatchObject({
      origin: GRANBY.coordinates,
      accuracyMeters: 8,
      targetDistanceKm: 80,
    });
    expect(routeSpy).toHaveBeenCalled();
    expect(routeSpy.mock.calls[0]?.[0].waypoints).toEqual(viaPointsFor(80));
    expect(result.route.geometry.coordinates.length).toBeGreaterThanOrEqual(8);
    expect(result.route.distanceKm).toBeGreaterThan(0);
    expect(result.route.durationMinutes).toBeGreaterThan(0);
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
        return { viaPoints: vias, roads: [], pointsOfInterest: [] };
      },
    };
    const planSpy = vi.spyOn(planner, "planLoop");
    const routing = new MockRoutingProvider();
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

  it("regenerates a destination request through the AI one-way pipeline (FR-012, FR-034)", async () => {
    const search = fakeSearch();
    const arrival = offsetCoordinates(GRANBY.coordinates, 0, 78);
    const vias = [
      offsetCoordinates(GRANBY.coordinates, 90, 40),
      offsetCoordinates(GRANBY.coordinates, 90, 78),
    ];
    const planner: AiRidePlanner = {
      async planLoop() {
        return { viaPoints: vias, roads: [], pointsOfInterest: [] };
      },
    };
    const planSpy = vi.spyOn(planner, "planLoop");
    const routing = new MockRoutingProvider();
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
      { webSearch: search, planner },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.type).toBe("destination");
    expect(planSpy.mock.calls[0]?.[0].returnToStart).toBe(false);
    expect(routeSpy.mock.calls[0]?.[0].destination).toEqual(vias[1]);
    expect(routeSpy.mock.calls[0]?.[0].destination).not.toEqual(arrival);
    if (result.route.type !== "destination") {
      throw new Error("expected a destination route");
    }
    expect(result.route.destination.label).toBe("Arrivée proposée");
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
        return { viaPoints: vias, roads: [], pointsOfInterest: [] };
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
      new MockRoutingProvider(),
      undefined,
      { webSearch: fakeSearch(), planner },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.type).toBe("destination");
  });

  it("does not fall back to geometric loop seeds when AI is required", async () => {
    const geometric = createLoopWaypointSets(GRANBY.coordinates, 80);
    const routing = new MockRoutingProvider();
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
    expect(used).toEqual(viaPointsFor(80));
    expect(used).not.toEqual(geometric[0]?.waypoints);
  });

  it("returns WEB_SEARCH_UNAVAILABLE without calling a non-AI generator", async () => {
    const routing = new MockRoutingProvider();
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
      new MockRoutingProvider(),
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
      new MockRoutingProvider(),
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
      new MockRoutingProvider(),
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
    const result = await generateRide({
      type: "loop",
      start: GRANBY,
      targetDistanceKm: 80,
      style: "scenic",
      useAiWebGeneration: true,
      originAccuracyMeters: 10,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.type).toBe("loop");
    expect(result.route.geometry.coordinates.length).toBeGreaterThanOrEqual(8);
  });

  it("uses the AI one-way pipeline for a destination describe regenerate (FR-012, FR-034)", async () => {
    const result = await generateRide({
      type: "destination",
      start: GRANBY,
      destination: {
        label: "Arrivée proposée",
        coordinates: offsetCoordinates(GRANBY.coordinates, 90, 80),
      },
      targetDistanceKm: 80,
      style: "scenic",
      useAiWebGeneration: true,
    });

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
