import { describe, expect, it } from "vitest";
import { generateDestinationRide } from "@/application/generate-destination-ride";
import { generateLoopRide } from "@/application/generate-loop-ride";
import { haversineKm, offsetCoordinates } from "@/domain/geo/distance";
import { radiusCoefficientOfVariation } from "@/domain/geo/geometry";
import type { Coordinates } from "@/domain/geo/types";
import { MockRoutingProvider } from "../mock-routing-provider";
import {
  createRoutingProvider,
  MISSING_CHAT_API_KEY_MESSAGE,
} from "../create-routing-provider";
import { composeRetrievedRoute } from "./compose";
import { buildLocalRoadIndex } from "./local-road-index";
import { RagRoutingProvider } from "./rag-routing-provider";
import {
  undirectedEdgeId,
  type CorridorRetriever,
  type RouteKnowledgeDocument,
} from "./types";

const GRANBY: Coordinates = { latitude: 45.403, longitude: -72.734 };
const TREMBLANT: Coordinates = { latitude: 46.118, longitude: -74.596 };

function emptyRetriever(): CorridorRetriever {
  return { retrieve: async () => [] };
}

function equatorRetriever(): CorridorRetriever {
  const document: RouteKnowledgeDocument = {
    id: "grid:0,0|1,0",
    text: "scenic secondary paved",
    roadName: "Équateur",
    roadClass: "secondary",
    surface: "paved",
    fromCell: { x: 0, y: 0 },
    toCell: { x: 1, y: 0 },
    from: { latitude: 0, longitude: 0 },
    to: { latitude: 0, longitude: 0.02 },
    midpoint: { latitude: 0, longitude: 0.01 },
  };
  return {
    retrieve: async () => [{ document, score: 9 }],
  };
}

function isMostlyRectilinear(coordinates: [number, number][]): boolean {
  let axisAligned = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const prev = coordinates[index - 1];
    const current = coordinates[index];
    const dLon = Math.abs(current[0] - prev[0]);
    const dLat = Math.abs(current[1] - prev[1]);
    const longest = Math.max(dLon, dLat);
    const shortest = Math.min(dLon, dLat);
    if (longest === 0 || shortest / longest < 0.15) {
      axisAligned += 1;
    }
  }
  return axisAligned / Math.max(1, coordinates.length - 1) > 0.8;
}

function sinuousShare(segments: { roadName?: string }[]): number {
  if (segments.length === 0) {
    return 0;
  }
  return (
    segments.filter((segment) => segment.roadName === "Route sinueuse").length /
    segments.length
  );
}

describe("RagRoutingProvider", () => {
  it("returns a closed rectilinear loop rather than a geometric circle (FR-001)", async () => {
    const provider = new RagRoutingProvider();
    const east = { latitude: 45.403, longitude: -72.5 };
    const north = { latitude: 45.55, longitude: -72.734 };
    const result = await provider.calculateRoute({
      start: GRANBY,
      destination: GRANBY,
      waypoints: [east, north],
    });

    const first = result.geometry.coordinates[0];
    const last =
      result.geometry.coordinates[result.geometry.coordinates.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    if (!first || !last) {
      return;
    }

    expect(
      haversineKm(GRANBY, { longitude: first[0], latitude: first[1] }),
    ).toBeLessThan(0.15);
    expect(
      haversineKm(GRANBY, { longitude: last[0], latitude: last[1] }),
    ).toBeLessThan(2.1);
    expect(result.geometry.coordinates.length).toBeGreaterThan(8);
    expect(radiusCoefficientOfVariation(result.geometry)).toBeGreaterThan(0.06);
    expect(isMostlyRectilinear(result.geometry.coordinates)).toBe(true);
  });

  it("follows a road grid from start to destination without a scaled sine (FR-002)", async () => {
    const provider = new RagRoutingProvider();
    const result = await provider.calculateRoute({
      start: GRANBY,
      destination: TREMBLANT,
      style: "touring",
    });

    const last =
      result.geometry.coordinates[result.geometry.coordinates.length - 1];
    expect(last).toBeDefined();
    if (!last) {
      return;
    }

    const chord = haversineKm(GRANBY, TREMBLANT);
    expect(
      haversineKm(TREMBLANT, { longitude: last[0], latitude: last[1] }),
    ).toBeLessThan(2.6);
    expect(result.distanceKm / chord).toBeLessThanOrEqual(1.75);
    expect(isMostlyRectilinear(result.geometry.coordinates)).toBe(true);
  });

  it("visits each waypoint on a multi-stop request", async () => {
    const provider = new RagRoutingProvider();
    const waypoint = offsetCoordinates(GRANBY, 90, 6);
    const destination = offsetCoordinates(waypoint, 0, 6);
    const result = await provider.calculateRoute({
      start: GRANBY,
      destination,
      waypoints: [waypoint],
    });

    const nearby = result.geometry.coordinates.some((position) => {
      return (
        haversineKm(waypoint, {
          longitude: position[0],
          latitude: position[1],
        }) < 2.1
      );
    });
    expect(nearby).toBe(true);
  });

  it("uses only retrieved edge geometry (NFR-005)", async () => {
    const origin = GRANBY;
    const destination = offsetCoordinates(origin, 90, 4);
    const allowed = new Set([
      undirectedEdgeId({ x: 0, y: 0 }, { x: 1, y: 0 }),
      undirectedEdgeId({ x: 1, y: 0 }, { x: 2, y: 0 }),
    ]);
    const retriever: CorridorRetriever = {
      retrieve: async ({ documents }) =>
        documents
          .filter((document) => allowed.has(document.id))
          .map((document) => ({ document, score: 2 })),
    };
    const provider = new RagRoutingProvider(retriever);
    const result = await provider.calculateRoute({
      start: origin,
      destination,
    });

    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.segments.every((segment) => allowed.has(segment.id))).toBe(
      true,
    );
  });

  it("fails when retrieval returns no corridors (FR-021)", async () => {
    const provider = new RagRoutingProvider(emptyRetriever());

    await expect(
      provider.calculateRoute({
        start: GRANBY,
        destination: TREMBLANT,
      }),
    ).rejects.toMatchObject({ reason: "empty" });
  });

  it("rejects a corpus anchored far from the request (NFR-005)", async () => {
    const provider = new RagRoutingProvider(equatorRetriever());

    await expect(
      provider.calculateRoute({
        start: GRANBY,
        destination: TREMBLANT,
      }),
    ).rejects.toMatchObject({ reason: "empty" });
  });

  it("does not place the origin on a motorway junction or an unpaved edge", () => {
    const nearby = offsetCoordinates(GRANBY, 90, 4);
    const originEdges = buildLocalRoadIndex(GRANBY, [GRANBY, nearby]).filter(
      (document) =>
        (document.fromCell.x === 0 && document.fromCell.y === 0) ||
        (document.toCell.x === 0 && document.toCell.y === 0),
    );

    expect(originEdges.length).toBeGreaterThan(0);
    expect(
      originEdges.every((document) => document.roadClass !== "motorway"),
    ).toBe(true);
    expect(
      originEdges.every((document) => document.surface !== "unpaved"),
    ).toBe(true);
  });

  it("fails when retrieved edges do not connect start to destination (FR-021)", async () => {
    const destination = offsetCoordinates(GRANBY, 90, 4);
    const allowed = new Set([
      undirectedEdgeId({ x: 0, y: 0 }, { x: 0, y: 1 }),
    ]);
    const retriever: CorridorRetriever = {
      retrieve: async ({ documents }) =>
        documents
          .filter((document) => allowed.has(document.id))
          .map((document) => ({ document, score: 2 })),
    };
    const provider = new RagRoutingProvider(retriever);

    await expect(
      provider.calculateRoute({
        start: GRANBY,
        destination,
      }),
    ).rejects.toMatchObject({ reason: "disconnected" });
  });

  it("names the unpaved preference when it isolates the start (FR-021)", async () => {
    const destination = offsetCoordinates(GRANBY, 90, 4);
    const allowed = new Set([
      undirectedEdgeId({ x: 0, y: 0 }, { x: 1, y: 0 }),
      undirectedEdgeId({ x: 1, y: 0 }, { x: 2, y: 0 }),
    ]);
    const retriever: CorridorRetriever = {
      retrieve: async ({ documents }) =>
        documents
          .filter((document) => allowed.has(document.id))
          .map((document) => ({
            document: { ...document, surface: "unpaved" },
            score: 2,
          })),
    };
    const provider = new RagRoutingProvider(retriever);

    await expect(
      provider.calculateRoute({
        start: GRANBY,
        destination,
        preferences: { avoidHighways: false, avoidUnpaved: true },
      }),
    ).rejects.toMatchObject({ reason: "unpaved" });
  });

  it("skips United States edges when stayInCanada is on (FR-028)", async () => {
    const detroitEdge: RouteKnowledgeDocument = {
      id: "grid:0,0|1,0",
      text: "detroit motorway paved",
      roadName: "I-75",
      roadClass: "motorway",
      surface: "paved",
      fromCell: { x: 0, y: 0 },
      toCell: { x: 1, y: 0 },
      from: { latitude: 42.3314, longitude: -83.0458 },
      to: { latitude: 42.34, longitude: -83.03 },
      midpoint: { latitude: 42.335, longitude: -83.038 },
    };
    const retriever: CorridorRetriever = {
      retrieve: async () => [{ document: detroitEdge, score: 9 }],
    };
    const provider = new RagRoutingProvider(retriever);
    const detroit = { latitude: 42.3314, longitude: -83.0458 };
    const nearby = { latitude: 42.34, longitude: -83.03 };

    await expect(
      provider.calculateRoute({
        start: detroit,
        destination: nearby,
        preferences: {
          avoidHighways: false,
          avoidUnpaved: false,
          stayInCanada: true,
        },
      }),
    ).rejects.toMatchObject({ reason: "canada_only" });
  });

  it("rejects a request whose bbox exceeds the indexable grid (FR-021)", async () => {
    const provider = new RagRoutingProvider();
    const far = offsetCoordinates(GRANBY, 90, 600);

    await expect(
      provider.calculateRoute({
        start: GRANBY,
        destination: far,
      }),
    ).rejects.toMatchObject({ reason: "too_far" });
  });

  it("routes a long diagonal without timing out the serverless budget", async () => {
    const provider = new RagRoutingProvider();
    const destination = offsetCoordinates(GRANBY, 45, 400);
    const result = await provider.calculateRoute({
      start: GRANBY,
      destination,
      style: "touring",
    });

    expect(result.distanceKm).toBeGreaterThan(400);
    expect(
      result.distanceKm / haversineKm(GRANBY, destination),
    ).toBeLessThanOrEqual(1.75);
  });

  it("lets ride style change the corridor ranking (FR-004, FR-006)", async () => {
    const provider = new RagRoutingProvider();
    const destination = offsetCoordinates(GRANBY, 90, 32);
    const curvy = await provider.calculateRoute({
      start: GRANBY,
      destination,
      style: "curvy",
    });
    const touring = await provider.calculateRoute({
      start: GRANBY,
      destination,
      style: "touring",
    });

    expect(sinuousShare(curvy.segments)).toBeGreaterThan(
      sinuousShare(touring.segments),
    );
    expect(curvy.geometry.coordinates).not.toEqual(touring.geometry.coordinates);
  });
});

describe("composeRetrievedRoute", () => {
  it("does not drop a stop pair when composing a retrieved path", () => {
    const documents = buildLocalRoadIndex(GRANBY, [
      GRANBY,
      offsetCoordinates(GRANBY, 90, 4),
    ]).filter((document) =>
      ["grid:0,0|1,0", "grid:1,0|2,0"].includes(document.id),
    );
    expect(documents.length).toBe(2);
    const result = composeRetrievedRoute(
      GRANBY,
      offsetCoordinates(GRANBY, 90, 4),
      documents,
    );
    expect(result.segments).toHaveLength(2);
    expect(result.geometry.coordinates.length).toBe(3);
  });

  it("copies known landscape tags onto segments without inventing extras (FR-005)", () => {
    const documents = buildLocalRoadIndex(GRANBY, [
      GRANBY,
      offsetCoordinates(GRANBY, 90, 2),
    ]).filter((document) => document.roadName === "Rang panoramique");
    expect(documents.length).toBeGreaterThan(0);
    const scenic = documents[0];
    if (!scenic) {
      throw new Error("expected a scenic grid edge");
    }

    const result = composeRetrievedRoute(scenic.from, scenic.to, [scenic]);

    expect(result.segments[0]?.landscapeFeatures).toEqual([
      "rural",
      "lake",
      "village",
      "panoramic",
    ]);
  });
});

describe("createRoutingProvider", () => {
  it("returns the mock grid by default so simulated data stays explicit (NFR-005)", () => {
    const provider = createRoutingProvider({});
    expect(provider).toBeInstanceOf(MockRoutingProvider);
  });

  it("returns the RAG adapter when knowledgeRouting is requested (FR-029)", () => {
    const provider = createRoutingProvider(
      { ROUTING_PROVIDER: "mock", OPENAI_API_KEY: "test-openai-key" },
      { knowledgeRouting: true },
    );
    expect(provider).toBeInstanceOf(RagRoutingProvider);
  });

  it("returns the RAG adapter for ROUTING_PROVIDER=ai-rag when the ChatGPT key is set (NFR-005)", () => {
    const provider = createRoutingProvider({
      ROUTING_PROVIDER: "ai-rag",
      OPENAI_API_KEY: "test-openai-key",
    });
    expect(provider).toBeInstanceOf(RagRoutingProvider);
  });

  it("rejects knowledge routing without a server ChatGPT key (FR-029)", () => {
    expect(() =>
      createRoutingProvider(
        { ROUTING_PROVIDER: "mock" },
        { knowledgeRouting: true },
      ),
    ).toThrow(MISSING_CHAT_API_KEY_MESSAGE);
    expect(() => createRoutingProvider({ ROUTING_PROVIDER: "ai-rag" })).toThrow(
      MISSING_CHAT_API_KEY_MESSAGE,
    );
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
        style: "touring",
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
    expect(result.route.distanceKm / haversineKm(GRANBY, TREMBLANT)).toBeLessThanOrEqual(
      1.75,
    );
  });

  it("maps an empty knowledge index to FR-021 for a loop", async () => {
    const result = await generateLoopRide(
      {
        type: "loop",
        start: { label: "Granby", coordinates: GRANBY },
        targetDistanceKm: 80,
      },
      new RagRoutingProvider(emptyRetriever()),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("NO_ROUTE_FOUND");
    expect(result.error.message).toMatch(/près de cette demande/);
    expect(result.error.suggestions.length).toBeGreaterThan(0);
  });

  it("maps an empty knowledge index to FR-021 for a destination", async () => {
    const result = await generateDestinationRide(
      {
        type: "destination",
        start: { label: "Granby", coordinates: GRANBY },
        destination: { label: "Mont-Tremblant", coordinates: TREMBLANT },
        style: "curvy",
      },
      new RagRoutingProvider(emptyRetriever()),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("NO_ROUTE_FOUND");
    expect(result.error.message).toMatch(/près de cette demande/);
    expect(result.error.suggestions.length).toBeGreaterThan(0);
  });
});
