/**
 * FR-046 — direction chevrons riding on the route, as in the reference render.
 *
 * The arrow is drawn here rather than fetched: Ride ships no sprite sheet, and
 * a theme must never depend on a resource that can go missing (NFR-005). A
 * renderer without a 2D canvas simply gets no arrows, and the route is
 * unaffected.
 */
export const ROUTE_ARROW_IMAGE_ID = "ride-route-arrow";
export const ROUTE_ARROW_LAYER_ID = "ride-route-arrows";

const ARROW_SIZE = 48;

/** Rendered at 2× and declared as such, so it stays crisp on a Retina screen. */
export const ROUTE_ARROW_PIXEL_RATIO = 2;

export function createRouteArrowImage(
  fill: string,
  outline: string,
): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = ARROW_SIZE;
  canvas.height = ARROW_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  // Points up: MapLibre turns a line-placed icon to face along the line.
  context.beginPath();
  context.moveTo(24, 11);
  context.lineTo(39, 31);
  context.lineTo(24, 24);
  context.lineTo(9, 31);
  context.closePath();
  context.fillStyle = fill;
  context.strokeStyle = outline;
  context.lineWidth = 3.5;
  context.lineJoin = "round";
  context.fill();
  context.stroke();
  return context.getImageData(0, 0, ARROW_SIZE, ARROW_SIZE);
}

type ArrowCapableMap = {
  hasImage?: (id: string) => boolean;
  addImage?: (id: string, image: ImageData, options?: { pixelRatio: number }) => void;
};

/**
 * Adds the arrow to the style's image set, once. Returns whether the style can
 * actually draw it, so the caller knows not to add a layer pointing at nothing.
 */
export function ensureRouteArrowImage(
  map: ArrowCapableMap,
  fill: string,
  outline: string,
): boolean {
  if (!map.addImage || !map.hasImage) {
    return false;
  }
  if (map.hasImage(ROUTE_ARROW_IMAGE_ID)) {
    return true;
  }
  const image = createRouteArrowImage(fill, outline);
  if (!image) {
    return false;
  }
  map.addImage(ROUTE_ARROW_IMAGE_ID, image, {
    pixelRatio: ROUTE_ARROW_PIXEL_RATIO,
  });
  return true;
}

export function routeArrowLayer() {
  return {
    id: ROUTE_ARROW_LAYER_ID,
    type: "symbol" as const,
    source: "ride-route",
    // Chevrons on a hairline route are litter; they start where they read.
    minzoom: 9,
    layout: {
      "symbol-placement": "line" as const,
      "symbol-spacing": 110,
      "icon-image": ROUTE_ARROW_IMAGE_ID,
      // The route's own direction matters more than label decluttering here.
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "icon-rotation-alignment": "map" as const,
      "icon-pitch-alignment": "map" as const,
      "icon-size": [
        "interpolate",
        ["linear"],
        ["zoom"],
        9,
        0.6,
        16,
        1.15,
      ] as unknown as number,
    },
  };
}
