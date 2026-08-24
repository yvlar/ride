import { afterEach, describe, expect, it, vi } from "vitest";
import { generateRide } from "./generate-ride";
import { isWithinDistanceTolerance } from "@/domain/ride/constraints";
import { MockRoutingProvider } from "@/infrastructure/routing/mock-routing-provider";
import { CorridorRankingError } from "@/infrastructure/routing/rag/corridor-ranking-error";
import { RagRoutingProvider } from "@/infrastructure/routing/rag/rag-routing-provider";
import { LexicalCorridorRetriever } from "@/infrastructure/routing/rag/retrieve";
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

describe("generateRide (FR-011)", () => {
  it("returns one normalized loop with geometry, distance and duration", async () => {
    const result = await generateRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        style: "curvy",
      },
      new MockRoutingProvider(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(Array.isArray(result.route)).toBe(false);
    expect(result.route).toEqual(
      expect.objectContaining({
        type: "loop",
        style: "curvy",
        distanceKm: expect.any(Number),
        durationMinutes: expect.any(Number),
      }),
    );
    expect(result.route.geometry.type).toBe("LineString");
    expect(result.route.geometry.coordinates.length).toBeGreaterThan(1);
    expect(
      isWithinDistanceTolerance(result.route.distanceKm, 80),
    ).toBe(true);
  });

  it("dispatches a destination request to FR-002", async () => {
    const result = await generateRide(
      {
        type: "destination",
        start: GRANBY,
        destination: TREMBLANT,
        style: "scenic",
      },
      new MockRoutingProvider(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.type).toBe("destination");
    expect(result.route.style).toBe("scenic");
    expect(result.route.distanceKm).toBeGreaterThan(0);
    expect(result.route.durationMinutes).toBeGreaterThan(0);
  });

  it("dispatches a round-trip request to FR-003", async () => {
    const result = await generateRide(
      {
        type: "round_trip",
        start: GRANBY,
        destination: TREMBLANT,
        style: "touring",
      },
      new MockRoutingProvider(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.type).toBe("round_trip");
    expect(result.route.style).toBe("touring");
  });

  it("rejects an invalid request with VALIDATION_ERROR", async () => {
    const result = await generateRide(
      {
        type: "loop",
        start: GRANBY,
      },
      new MockRoutingProvider(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(result.error.message.length).toBeGreaterThan(0);
    expect(result.error.suggestions.length).toBeGreaterThan(0);
  });

  it("rejects an unknown ride type", async () => {
    const result = await generateRide(
      {
        type: "surprise",
        start: GRANBY,
      },
      new MockRoutingProvider(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("UNSUPPORTED_RIDE_TYPE");
    expect(result.error.message).toMatch(/loop/);
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

    const result = await generateRide(
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

  it("forwards style and preferences to the routing provider (BR-003, BR-007)", async () => {
    const seen: ProviderRouteRequest[] = [];
    const provider: RoutingProvider = {
      async calculateRoute(input) {
        seen.push(input);
        return new MockRoutingProvider().calculateRoute(input);
      },
    };

    const result = await generateRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        style: "curvy",
        preferences: { avoidHighways: true, avoidUnpaved: true },
      },
      provider,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.type === "loop" && result.route.style).toBe("curvy");
    expect(seen.some((request) => request.style === "curvy")).toBe(true);
    expect(
      seen.some(
        (request) =>
          request.preferences?.avoidHighways === true &&
          request.preferences.avoidUnpaved === true,
      ),
    ).toBe(true);
  });
});

function isKnowledgeRoadName(name: string | undefined): boolean {
  return Boolean(name && !name.startsWith("Grid "));
}

describe("generateRide knowledge option (FR-029)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    process.env.OPENAI_API_KEY = "test-openai-key";
  });

  it("uses the knowledge adapter when useKnowledgeRouting is true", async () => {
    const result = await generateRide({
      type: "loop",
      start: GRANBY,
      targetDistanceKm: 80,
      style: "scenic",
      useKnowledgeRouting: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.segments.some((segment) => isKnowledgeRoadName(segment.roadName))).toBe(
      true,
    );
  });

  it("returns snapped road-network geometry when a road adapter is injected (FR-029, FR-001)", async () => {
    const snapped: ProviderRouteResult = {
      geometry: {
        type: "LineString",
        coordinates: [
          [-72.734, 45.403],
          [-72.7, 45.403],
          [-72.68, 45.42],
          [-72.69, 45.45],
          [-72.72, 45.46],
          [-72.75, 45.44],
          [-72.76, 45.41],
          [-72.734, 45.403],
        ],
      },
      segments: [
        {
          id: "road:0",
          geometry: {
            type: "LineString",
            coordinates: [
              [-72.734, 45.403],
              [-72.7, 45.403],
            ],
          },
          distanceKm: 80,
          durationMinutes: 90,
          roadName: "Chemin du Lac",
          surface: "paved",
        },
      ],
      steps: [],
      distanceKm: 80,
      durationMinutes: 90,
    };
    const roads: RoutingProvider = {
      async calculateRoute() {
        return snapped;
      },
    };

    const result = await generateRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        style: "scenic",
        useKnowledgeRouting: true,
      },
      new RagRoutingProvider(new LexicalCorridorRetriever(), {
        roadNetwork: roads,
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.geometry).toEqual(snapped.geometry);
    expect(result.route.segments[0]?.roadName).toBe("Chemin du Lac");
  });

  it("keeps the environment mock adapter when the flag is absent", async () => {
    const result = await generateRide({
      type: "loop",
      start: GRANBY,
      targetDistanceKm: 80,
      style: "scenic",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(
      result.route.segments.every(
        (segment) => !segment.roadName || segment.roadName.startsWith("Grid "),
      ),
    ).toBe(true);
  });

  it("maps an empty knowledge graph to FR-021", async () => {
    const result = await generateRide({
      type: "destination",
      start: GRANBY,
      destination: {
        label: "Perth",
        coordinates: { latitude: -31.95, longitude: 115.86 },
      },
      style: "touring",
      useKnowledgeRouting: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.message).toMatch(/FR-021/);
  });

  it("maps a missing ChatGPT key to PROVIDER_ERROR (FR-029)", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const result = await generateRide({
      type: "loop",
      start: GRANBY,
      targetDistanceKm: 80,
      style: "scenic",
      useKnowledgeRouting: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("PROVIDER_ERROR");
    expect(result.error.message).toMatch(/OPENAI_API_KEY/);
  });

  it("maps a ChatGPT ranking failure to PROVIDER_ERROR (FR-029)", async () => {
    const ranking: RoutingProvider = {
      async calculateRoute() {
        throw new CorridorRankingError(
          "Le classement des corridors a échoué (HTTP 401).",
        );
      },
    };
    const result = await generateRide(
      {
        type: "loop",
        start: GRANBY,
        targetDistanceKm: 80,
        style: "scenic",
        useKnowledgeRouting: true,
      },
      ranking,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("PROVIDER_ERROR");
    expect(result.error.message).toMatch(/classement des corridors/);
    expect(result.error.message).not.toMatch(/cartographie/);
  });
});
