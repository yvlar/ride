import { describe, expect, it } from "vitest";
import { radiusCoefficientOfVariation } from "@/domain/geo/geometry";
import { haversineKm, offsetCoordinates } from "@/domain/geo/distance";
import type { Coordinates } from "@/domain/geo/types";
import { MockRoutingProvider } from "./mock-routing-provider";
import { RagRoutingProvider } from "./rag/rag-routing-provider";

const GRANBY: Coordinates = { latitude: 45.403, longitude: -72.734 };

describe("MockRoutingProvider", () => {
  it("returns a closed road-network loop rather than a geometric circle (FR-001)", async () => {
    const provider = new MockRoutingProvider();
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
    ).toBeLessThan(2.1);
    expect(
      haversineKm(GRANBY, {
        longitude: last[0],
        latitude: last[1],
      }),
    ).toBeLessThan(2.1);
    expect(result.geometry.coordinates.length).toBeGreaterThan(8);
    expect(radiusCoefficientOfVariation(result.geometry)).toBeGreaterThan(0.06);
    expect(result.distanceKm).toBeGreaterThan(0);
  });

  it("returns a point-to-point road path for a destination request (FR-002)", async () => {
    const provider = new MockRoutingProvider();
    const tremblant: Coordinates = { latitude: 46.118, longitude: -74.596 };
    const result = await provider.calculateRoute({
      start: GRANBY,
      destination: tremblant,
    });

    const last = result.geometry.coordinates[result.geometry.coordinates.length - 1];
    expect(last).toBeDefined();
    if (!last) {
      return;
    }

    expect(
      haversineKm(tremblant, {
        longitude: last[0],
        latitude: last[1],
      }),
    ).toBeLessThan(2.6);
    expect(result.geometry.coordinates.length).toBeGreaterThan(8);
  });

  it("honors avoidUnpaved by using the same graph as the RAG adapter (NFR-005)", async () => {
    const destination = offsetCoordinates(GRANBY, 90, 8);
    const request = {
      start: GRANBY,
      destination,
      preferences: { avoidHighways: false, avoidUnpaved: true },
    };
    const mock = await new MockRoutingProvider().calculateRoute(request);
    const rag = await new RagRoutingProvider().calculateRoute(request);

    expect(mock.segments.every((segment) => segment.surface !== "unpaved")).toBe(
      true,
    );
    expect(mock.geometry.coordinates).toEqual(rag.geometry.coordinates);
  });

  it("keeps the manhattan grid when only avoidHighways is set", async () => {
    const destination = offsetCoordinates(GRANBY, 90, 8);
    const base = { start: GRANBY, destination };
    const manhattan = await new MockRoutingProvider().calculateRoute(base);
    const flagged = await new MockRoutingProvider().calculateRoute({
      ...base,
      preferences: { avoidHighways: true, avoidUnpaved: false },
    });

    expect(flagged.geometry.coordinates).toEqual(manhattan.geometry.coordinates);
  });
});
