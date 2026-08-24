import { describe, expect, it, vi } from "vitest";
import { createLightweightNavigationMapEngine } from "./lightweight-navigation-map-engine";
import type { RideMapViewModel } from "./ride-map-view-model";

const viewModel: RideMapViewModel = {
  geometry: {
    type: "LineString",
    coordinates: [
      [-72.7, 45.4],
      [-72.69, 45.41],
      [-72.68, 45.4],
    ],
  },
  bounds: { west: -72.7, south: 45.4, east: -72.68, north: 45.41 },
  start: {
    kind: "start",
    label: "Départ",
    placeLabel: "Granby",
    coordinates: { latitude: 45.4, longitude: -72.7 },
  },
  directionLabel: "Sens : boucle depuis Granby",
  directionArrows: [],
};

describe("createLightweightNavigationMapEngine", () => {
  it("renders and follows GPS without creating a WebGL canvas (FR-023, NFR-006)", () => {
    const container = document.createElement("div");
    const handle = createLightweightNavigationMapEngine().mount(
      container,
      viewModel,
      { onError: vi.fn() },
    );

    const svg = container.querySelector("svg");
    const marker = container.querySelector("[data-current-location=true]");
    expect(svg).not.toBeNull();
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.textContent).toContain("Carte simplifiée");
    expect(marker).toHaveAttribute("visibility", "hidden");

    handle.setUserLocation?.({ latitude: 45.405, longitude: -72.69 });
    expect(marker).toHaveAttribute("visibility", "visible");
    expect(marker?.getAttribute("transform")).toContain("translate(");
    expect(marker?.querySelector("[data-motorcycle-glyph=true]")).not.toBeNull();
    expect(marker?.querySelectorAll("path").length).toBeGreaterThan(0);

    handle.setUserLocation?.({ latitude: 45.405, longitude: -72.69 }, 90);
    expect(marker?.getAttribute("transform")).toContain("rotate(90)");

    const fullRouteView = svg?.getAttribute("viewBox");
    handle.setFollowUser?.(true);
    expect(svg?.getAttribute("viewBox")).not.toBe(fullRouteView);

    handle.setFollowUser?.(false);
    expect(svg?.getAttribute("viewBox")).toBe(fullRouteView);

    handle.recenter?.();
    expect(svg?.getAttribute("viewBox")).not.toBe(fullRouteView);

    handle.destroy();
    expect(container).toBeEmptyDOMElement();
  });

  it("updates the route in place without remounting (FR-026)", () => {
    const container = document.createElement("div");
    const handle = createLightweightNavigationMapEngine().mount(
      container,
      viewModel,
      { onError: vi.fn() },
    );
    const svg = container.querySelector("svg");
    const firstPoints = container.querySelector("polyline")?.getAttribute("points");

    handle.setViewModel?.({
      ...viewModel,
      geometry: {
        type: "LineString",
        coordinates: [
          [-72.7, 45.4],
          [-72.65, 45.42],
        ],
      },
      bounds: { west: -72.7, south: 45.4, east: -72.65, north: 45.42 },
    });

    expect(container.querySelector("svg")).toBe(svg);
    expect(container.querySelector("polyline")?.getAttribute("points")).not.toBe(
      firstPoints,
    );
    handle.destroy();
  });
});
