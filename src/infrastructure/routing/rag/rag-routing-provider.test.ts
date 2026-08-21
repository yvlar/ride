import { describe, expect, it } from "vitest";
import { generateDestinationRide } from "@/application/generate-destination-ride";
import { generateLoopRide } from "@/application/generate-loop-ride";
import { radiusCoefficientOfVariation } from "@/domain/geo/geometry";
import { haversineKm } from "@/domain/geo/distance";
import type { Coordinates } from "@/domain/geo/types";
import { MockRoutingProvider } from "../mock-routing-provider";
import { createRoutingProvider } from "../create-routing-provider";
import { RagRoutingProvider } from "./rag-routing-provider";
import { buildRouteRetrievalQuery, LexicalCorridorRetriever } from "./retrieve";
import type { CorridorRetriever, RouteKnowledgeDocument } from "./types";

const GRANBY: Coordinates = { latitude: 45.403, longitude: -72.734 };
const TREMBLANT: Coordinates = { latitude: 46.118, longitude: -74.596 };

const SINGLE_CORRIDOR: RouteKnowledgeDocument = {
  id: "test-ridge",
  text: "boucle moto ridge secondary paved",
  roadName: "Route de test",
  roadClass: "secondary",
  surface: "paved",
  relativePath: [
    { eastKm: 0, northKm: 0 },
    { eastKm: 2, northKm: 1.2 },
    { eastKm: 4, northKm: -0.8 },
    { eastKm: 6, northKm: 1.1 },
    { eastKm: 8, northKm: -0.4 },
    { eastKm: 10, northKm: 0 },
  ],
};

describe("RagRoutingProvider", () => {
  it("returns a closed road-network loop rather than a geometric circle (FR-001)", async () => {
    const provider = new RagRoutingProvider();
    const east = { latitude: 45.403, longitude: -72.5 };
    const north = { latitude: 45.55, longitude: -72.734 };
    const result = await provider.calculateRoute({
      start: GRANBY,
      destination: GRANBY,
      waypoints: [east, north],
    });

    const first = result.geometry.coordinates[0];
    const last = result.geometry.coordinates[result.geometry.coordinates.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    if (!first || !last) {
      return;
    }

    expect(
      haversineKm(GRANBY, {
        longitude: first[0],
        latitude: first[1],
      }),
    ).toBeLessThan(0.15);
    expect(
      haversineKm(GRANBY, {
        longitude: last[0],
        latitude: last[1],
      }),
    ).toBeLessThan(0.15);
    expect(result.geometry.coordinates.length).toBeGreaterThan(8);
    expect(radiusCoefficientOfVariation(result.geometry)).toBeGreaterThan(0.06);
    expect(result.distanceKm).toBeGreaterThan(0);
  });

  it("returns a point-to-point path grounded in retrieved corridors (FR-002)", async () => {
    const provider = new RagRoutingProvider();
    const result = await provider.calculateRoute({
      start: GRANBY,
      destination: TREMBLANT,
    });

    const last = result.geometry.coordinates[result.geometry.coordinates.length - 1];
    expect(last).toBeDefined();
    if (!last) {
      return;
    }

    expect(
      haversineKm(TREMBLANT, {
        longitude: last[0],
        latitude: last[1],
      }),
    ).toBeLessThan(0.15);
    expect(result.geometry.coordinates.length).toBeGreaterThan(8);
    expect(result.segments.length).toBeGreaterThan(0);
  });

  it("uses only retrieved document geometry (NFR-005)", async () => {
    const retriever: CorridorRetriever = {
      retrieve: async () => [{ document: SINGLE_CORRIDOR, score: 4 }],
    };
    const provider = new RagRoutingProvider(retriever);
    const result = await provider.calculateRoute({
      start: GRANBY,
      destination: TREMBLANT,
    });

    expect(result.segments.length).toBeGreaterThan(0);
    expect(
      result.segments.every((segment) => segment.roadName === "Route de test"),
    ).toBe(true);
    expect(
      result.segments.every((segment) => segment.id.startsWith("rag:test-ridge:")),
    ).toBe(true);
  });

  it("fails when retrieval returns no corridors (FR-021)", async () => {
    const retriever: CorridorRetriever = {
      retrieve: async () => [],
    };
    const provider = new RagRoutingProvider(retriever);

    await expect(
      provider.calculateRoute({
        start: GRANBY,
        destination: TREMBLANT,
      }),
    ).rejects.toThrow(/corridor connu/i);
  });

  it("ranks paved scenic corridors above highway and gravel (NFR-005)", async () => {
    const retriever = new LexicalCorridorRetriever();
    const query = buildRouteRetrievalQuery({
      start: GRANBY,
      destination: TREMBLANT,
    });
    const retrieved = await retriever.retrieve(query, 5);

    expect(retrieved.length).toBeGreaterThan(0);
    expect(retrieved[0]?.document.roadClass).not.toBe("motorway");
    expect(retrieved[0]?.document.surface).toBe("paved");
    expect(retrieved.some((entry) => entry.document.id === "highway-corridor")).toBe(
      false,
    );
  });
});

describe("createRoutingProvider", () => {
  it("returns the RAG adapter by default (NFR-005)", () => {
    const provider = createRoutingProvider({});
    expect(provider).toBeInstanceOf(RagRoutingProvider);
  });

  it("still returns the mock grid when ROUTING_PROVIDER=mock", () => {
    const provider = createRoutingProvider({ ROUTING_PROVIDER: "mock" });
    expect(provider).toBeInstanceOf(MockRoutingProvider);
  });

  it("rejects an unwired named graph engine (BR-004)", () => {
    expect(() =>
      createRoutingProvider({ ROUTING_PROVIDER: "graphhopper" }),
    ).toThrow(/ai-rag/);
  });
});

describe("RAG generation through application services", () => {
  it("generates a loop within ±10 % using the RAG adapter (FR-001, BR-001)", async () => {
    const result = await generateLoopRide(
      {
        type: "loop",
        start: { label: "Granby", coordinates: GRANBY },
        targetDistanceKm: 80,
      },
      new RagRoutingProvider(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.type).toBe("loop");
    expect(result.route.distanceKm).toBeGreaterThan(72);
    expect(result.route.distanceKm).toBeLessThan(88);
  });

  it("generates a destination ride using the RAG adapter (FR-002)", async () => {
    const result = await generateDestinationRide(
      {
        type: "destination",
        start: { label: "Granby", coordinates: GRANBY },
        destination: { label: "Mont-Tremblant", coordinates: TREMBLANT },
        style: "scenic",
      },
      new RagRoutingProvider(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.route.type).toBe("destination");
    expect(result.route.destination.label).toBe("Mont-Tremblant");
  });
});
