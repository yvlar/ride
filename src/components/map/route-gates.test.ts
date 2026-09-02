import { describe, expect, it, vi } from "vitest";
import type { LineString } from "@/domain/geo/types";
import {
  ROUTE_GATE_IMAGE_ID,
  ROUTE_GATE_LAYER_ID,
  ROUTE_MILEPOST_LAYER_ID,
  createRouteGateImage,
  ensureRouteGateImage,
  milepostIntervalKm,
  routeGateFeatureCollection,
  routeGateLayer,
  routeMilepostFeatureCollection,
  routeMilepostLayer,
} from "./route-gates";

/** North for a kilometre, then east: two unmistakable headings. */
const ELBOW: LineString = {
  type: "LineString",
  coordinates: [
    [-72.5, 45.0],
    [-72.5, 45.01],
    [-72.48, 45.01],
  ],
};

describe("checkered route gates (FR-046)", () => {
  it("skips the gate when the renderer has no 2D canvas", () => {
    // jsdom has no canvas backend, which is exactly the degraded case: the
    // route must still be drawn, just without gates (NFR-005).
    expect(createRouteGateImage("#fff", "#000")).toBeNull();

    const addImage = vi.fn();
    expect(
      ensureRouteGateImage({ addImage, hasImage: () => false }, "#fff", "#000"),
    ).toBe(false);
    expect(addImage).not.toHaveBeenCalled();
  });

  it("adds the gate once, however often the style is rebuilt", () => {
    const addImage = vi.fn();
    expect(
      ensureRouteGateImage({ addImage, hasImage: () => true }, "#fff", "#000"),
    ).toBe(true);
    expect(addImage).not.toHaveBeenCalled();
  });

  it("reports no gate on a renderer without an image API", () => {
    expect(ensureRouteGateImage({}, "#fff", "#000")).toBe(false);
  });

  it("stands each gate square across the road", () => {
    const gates = routeGateFeatureCollection(ELBOW);
    expect(gates.features).toHaveLength(2);

    const [start, finish] = gates.features;
    expect(start.properties.kind).toBe("start");
    expect(finish.properties.kind).toBe("finish");
    // Leaving north (0°) and arriving east (90°), each turned a quarter turn.
    expect(start.properties.bearing).toBeCloseTo(90, 0);
    expect(finish.properties.bearing).toBeCloseTo(180, 0);
    expect(start.geometry.coordinates).toEqual([-72.5, 45.0]);
    expect(finish.geometry.coordinates).toEqual([-72.48, 45.01]);
  });

  it("draws no gate on a route with no direction", () => {
    expect(
      routeGateFeatureCollection({
        type: "LineString",
        coordinates: [[-72.5, 45]],
      }).features,
    ).toEqual([]);
  });

  it("lets both ends of a loop draw on top of each other", () => {
    const layer = routeGateLayer();
    expect(layer.source).toBe("ride-route-gates");
    expect(layer.layout["icon-image"]).toBe(ROUTE_GATE_IMAGE_ID);
    expect(layer.layout["icon-allow-overlap"]).toBe(true);
    // Rotated with the map, not with the screen: a gate is painted on the road.
    expect(layer.layout["icon-rotation-alignment"]).toBe("map");
    expect(layer.layout["icon-rotate"]).toEqual(["get", "bearing"]);
    expect(layer.id).toBe(ROUTE_GATE_LAYER_ID);
  });
});

describe("kilometre boards (FR-046)", () => {
  it("keeps a route to about a dozen boards, at round distances", () => {
    expect(milepostIntervalKm(60)).toBe(5);
    expect(milepostIntervalKm(250)).toBe(25);
    expect(milepostIntervalKm(650)).toBe(100);
    // At any length the boards stay a round number apart and stay countable.
    for (const km of [30, 100, 180, 400, 900, 3000]) {
      const interval = milepostIntervalKm(km);
      expect(Number.isInteger(interval)).toBe(true);
      expect(km / interval).toBeLessThanOrEqual(12);
    }
  });

  it("labels each board with its distance and its unit", () => {
    const long: LineString = {
      type: "LineString",
      coordinates: [
        [-72.5, 45.0],
        [-72.5, 45.9],
      ],
    };
    const boards = routeMilepostFeatureCollection(long);
    expect(boards.features.length).toBeGreaterThan(0);
    expect(boards.features.length).toBeLessThanOrEqual(12);
    // ~100 km at a 10 km interval: the first board stands at 10.
    expect(boards.features[0].properties.label).toBe("10");
  });

  it("hides itself during navigation by taking the decor prefix", () => {
    // `applyDetailLevel()` hides every `kart-decor-` layer once a session
    // starts; the boards get that for free by being named for it.
    const layer = routeMilepostLayer("#17324D", "#FFFFFF");
    expect(layer.id).toBe(ROUTE_MILEPOST_LAYER_ID);
    expect(layer.id.startsWith("kart-decor-")).toBe(true);
    // The unit rides on the label: a bare number would be a mystery (NFR-001).
    expect(layer.layout["text-field"]).toEqual([
      "concat",
      ["get", "label"],
      " km",
    ]);
    expect(layer.paint["text-color"]).toBe("#17324D");
  });
});
