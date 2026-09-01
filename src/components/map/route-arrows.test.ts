import { describe, expect, it, vi } from "vitest";
import {
  ROUTE_ARROW_IMAGE_ID,
  ROUTE_ARROW_LAYER_ID,
  createRouteArrowImage,
  ensureRouteArrowImage,
  routeArrowLayer,
} from "./route-arrows";

describe("route direction chevrons (FR-046)", () => {
  it("skips the arrow when the renderer has no 2D canvas", () => {
    // jsdom has no canvas backend, which is exactly the degraded case: the
    // route must still be drawn, just without chevrons (NFR-005).
    expect(createRouteArrowImage("#fff", "#000")).toBeNull();

    const addImage = vi.fn();
    expect(
      ensureRouteArrowImage(
        { addImage, hasImage: () => false },
        "#fff",
        "#000",
      ),
    ).toBe(false);
    expect(addImage).not.toHaveBeenCalled();
  });

  it("adds the arrow once, however often the style is rebuilt", () => {
    const addImage = vi.fn();
    expect(
      ensureRouteArrowImage({ addImage, hasImage: () => true }, "#fff", "#000"),
    ).toBe(true);
    expect(addImage).not.toHaveBeenCalled();
  });

  it("reports no arrow on a renderer without an image API", () => {
    expect(ensureRouteArrowImage({}, "#fff", "#000")).toBe(false);
  });

  it("places the chevrons along the route, above its line", () => {
    const layer = routeArrowLayer();

    expect(layer.id).toBe(ROUTE_ARROW_LAYER_ID);
    expect(layer.source).toBe("ride-route");
    expect(layer.layout["symbol-placement"]).toBe("line");
    expect(layer.layout["icon-image"]).toBe(ROUTE_ARROW_IMAGE_ID);
    expect(layer.layout["icon-rotation-alignment"]).toBe("map");
    // Direction beats decluttering: a hidden chevron is a missing instruction.
    expect(layer.layout["icon-allow-overlap"]).toBe(true);
    // Chevrons on a hairline route are litter.
    expect(layer.minzoom).toBeGreaterThanOrEqual(9);
  });
});
