import { describe, expect, it } from "vitest";
import { radiusCoefficientOfVariation } from "@/domain/geo/geometry";
import { haversineKm, offsetCoordinates } from "@/domain/geo/distance";
import type { Coordinates } from "@/domain/geo/types";
import { MockRoutingProvider } from "./mock-routing-provider";

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
    expect(result.steps?.some((step) => step.maneuverType === "depart")).toBe(
      true,
    );
    expect(result.steps?.some((step) => step.maneuverType === "arrive")).toBe(
      true,
    );
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

  it("keeps the manhattan grid when avoidance preferences are set (BR-007)", async () => {
    const destination = offsetCoordinates(GRANBY, 90, 8);
    const base = { start: GRANBY, destination };
    const manhattan = await new MockRoutingProvider().calculateRoute(base);
    const unpaved = await new MockRoutingProvider().calculateRoute({
      ...base,
      preferences: { avoidHighways: false, avoidUnpaved: true },
    });
    const highways = await new MockRoutingProvider().calculateRoute({
      ...base,
      preferences: { avoidHighways: true, avoidUnpaved: false },
    });

    expect(unpaved.segments.every((segment) => segment.surface !== "unpaved")).toBe(
      true,
    );
    expect(unpaved.geometry.coordinates).toEqual(manhattan.geometry.coordinates);
    expect(highways.geometry.coordinates).toEqual(manhattan.geometry.coordinates);
  });

  it("does not fail a long mock request as RAG too_far when avoidUnpaved is set", async () => {
    const destination = offsetCoordinates(GRANBY, 90, 600);
    const result = await new MockRoutingProvider().calculateRoute({
      start: GRANBY,
      destination,
      preferences: { avoidHighways: false, avoidUnpaved: true },
    });

    expect(result.distanceKm).toBeGreaterThan(500);
    expect(result.segments.every((segment) => segment.surface !== "unpaved")).toBe(
      true,
    );
  });
});
