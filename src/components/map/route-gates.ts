/**
 * FR-046 — the start and finish gates, and the kilometre boards between them.
 *
 * A checkered band across the road is the oldest sign in motor racing, and it
 * is what turns a drawn line into a circuit. Like the direction chevrons in
 * `route-arrows.ts`, both images are drawn here rather than fetched: Ride ships
 * no sprite sheet, and a theme must never depend on a resource that can go
 * missing (NFR-005). A renderer without a 2D canvas simply gets no gates, and
 * the route is unaffected.
 *
 * Generic racing furniture, drawn from scratch — nothing here is taken from
 * any published game.
 */
import type { LineString } from "@/domain/geo/types";
import {
  endpointBearingsDeg,
  firstCoordinates,
  lastCoordinates,
  pointsAtIntervalKm,
} from "@/domain/geo/geometry";
import { lineStringLengthKm } from "@/domain/geo/distance";

export const ROUTE_GATE_IMAGE_ID = "ride-route-gate";
export const ROUTE_GATE_SOURCE_ID = "ride-route-gates";
export const ROUTE_GATE_LAYER_ID = "ride-route-gate-symbols";

/**
 * The boards ride under the decor prefix on purpose: `applyDetailLevel()`
 * already hides everything so named the moment a session starts, and while
 * riding the screen belongs to the manoeuvre.
 */
export const ROUTE_MILEPOST_SOURCE_ID = "ride-route-mileposts";
export const ROUTE_MILEPOST_LAYER_ID = "kart-decor-route-mileposts";

const GATE_WIDTH = 96;
const GATE_HEIGHT = 32;
const GATE_COLUMNS = 8;
const GATE_ROWS = 2;

/** Rendered at 2× and declared as such, so it stays crisp on a Retina screen. */
export const ROUTE_GATE_PIXEL_RATIO = 2;

export function createRouteGateImage(
  light: string,
  dark: string,
): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = GATE_WIDTH;
  canvas.height = GATE_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const cellWidth = GATE_WIDTH / GATE_COLUMNS;
  const cellHeight = GATE_HEIGHT / GATE_ROWS;
  for (let row = 0; row < GATE_ROWS; row += 1) {
    for (let column = 0; column < GATE_COLUMNS; column += 1) {
      context.fillStyle = (row + column) % 2 === 0 ? light : dark;
      context.fillRect(
        column * cellWidth,
        row * cellHeight,
        cellWidth,
        cellHeight,
      );
    }
  }

  // An outline keeps the band readable over cream roads and turquoise water
  // alike — the check pattern alone disappears against either.
  context.strokeStyle = dark;
  context.lineWidth = 3;
  context.strokeRect(1.5, 1.5, GATE_WIDTH - 3, GATE_HEIGHT - 3);

  return context.getImageData(0, 0, GATE_WIDTH, GATE_HEIGHT);
}

type ImageCapableMap = {
  hasImage?: (id: string) => boolean;
  addImage?: (id: string, image: ImageData, options?: { pixelRatio: number }) => void;
};

/**
 * Adds the gate to the style's image set, once. Returns whether the style can
 * actually draw it, so the caller knows not to add a layer pointing at nothing.
 */
export function ensureRouteGateImage(
  map: ImageCapableMap,
  light: string,
  dark: string,
): boolean {
  if (!map.addImage || !map.hasImage) {
    return false;
  }
  if (map.hasImage(ROUTE_GATE_IMAGE_ID)) {
    return true;
  }
  const image = createRouteGateImage(light, dark);
  if (!image) {
    return false;
  }
  map.addImage(ROUTE_GATE_IMAGE_ID, image, {
    pixelRatio: ROUTE_GATE_PIXEL_RATIO,
  });
  return true;
}

export type GateFeatureCollection = {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    properties: { bearing: number; kind: "start" | "finish" };
    geometry: { type: "Point"; coordinates: [number, number] };
  }[];
};

/**
 * The gates sit square across the road, so each carries the route's heading
 * turned a quarter turn. A loop that ends where it began still gets two: the
 * headings differ, and seeing both is how the rider reads the direction.
 */
export function routeGateFeatureCollection(
  geometry: LineString,
): GateFeatureCollection {
  const bearings = endpointBearingsDeg(geometry);
  const start = firstCoordinates(geometry);
  const finish = lastCoordinates(geometry);
  if (!bearings || !start || !finish) {
    return { type: "FeatureCollection", features: [] };
  }

  return {
    type: "FeatureCollection",
    features: [
      gateFeature(start, bearings.start + 90, "start"),
      gateFeature(finish, bearings.end + 90, "finish"),
    ],
  };
}

function gateFeature(
  point: { latitude: number; longitude: number },
  bearing: number,
  kind: "start" | "finish",
): GateFeatureCollection["features"][number] {
  return {
    type: "Feature",
    properties: { bearing: ((bearing % 360) + 360) % 360, kind },
    geometry: {
      type: "Point",
      coordinates: [point.longitude, point.latitude],
    },
  };
}

export function routeGateLayer() {
  return {
    id: ROUTE_GATE_LAYER_ID,
    type: "symbol" as const,
    source: ROUTE_GATE_SOURCE_ID,
    // A gate on a route drawn two pixels wide is a smudge; it earns its place
    // once the road under it is a road.
    minzoom: 10,
    layout: {
      "icon-image": ROUTE_GATE_IMAGE_ID,
      // Both ends of a loop can land on the same pixel; drawing them both is
      // the point, so neither is allowed to declutter the other away.
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "icon-rotate": ["get", "bearing"] as unknown as number,
      "icon-rotation-alignment": "map" as const,
      "icon-pitch-alignment": "map" as const,
      "icon-size": [
        "interpolate",
        ["linear"],
        ["zoom"],
        10,
        0.45,
        16,
        1,
      ] as unknown as number,
    },
  };
}

export type MilepostFeatureCollection = {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    properties: { label: string };
    geometry: { type: "Point"; coordinates: [number, number] };
  }[];
};

/**
 * FR-046 — one board roughly every `1/12` of the route, rounded to a round
 * number of kilometres so the labels read as distances and not as arbitrary
 * fractions. A 250 km loop gets a board every 20 km; a 60 km outing every
 * 10 km. Never more than a dozen, at any length.
 */
export function milepostIntervalKm(routeKm: number): number {
  const raw = routeKm / 12;
  const steps = [5, 10, 20, 25, 50, 100];
  return (
    steps.find((step) => step >= raw) ??
    // Past the table, round up to the next hundred: the boards stay round
    // numbers and stay countable however long the ride.
    Math.ceil(raw / 100) * 100
  );
}

export function routeMilepostFeatureCollection(
  geometry: LineString,
): MilepostFeatureCollection {
  const routeKm = lineStringLengthKm(geometry);
  const intervalKm = milepostIntervalKm(routeKm);
  return {
    type: "FeatureCollection",
    features: pointsAtIntervalKm(geometry, intervalKm).map((point) => ({
      type: "Feature" as const,
      properties: { label: `${Math.round(point.distanceKm)}` },
      geometry: {
        type: "Point" as const,
        coordinates: [point.coordinates.longitude, point.coordinates.latitude] as [
          number,
          number,
        ],
      },
    })),
  };
}

export function routeMilepostLayer(textColor: string, haloColor: string) {
  return {
    id: ROUTE_MILEPOST_LAYER_ID,
    type: "symbol" as const,
    source: ROUTE_MILEPOST_SOURCE_ID,
    minzoom: 8,
    layout: {
      // The unit is on the board: the number alone would be a mystery, and
      // information is never carried by position alone either (NFR-001).
      "text-field": ["concat", ["get", "label"], " km"] as unknown as string,
      "text-font": ["Noto Sans Bold"],
      "text-size": 13,
      "text-padding": 6,
      // Unlike the gates, these may declutter: a board hidden behind another
      // board tells the rider nothing.
      "text-allow-overlap": false,
      "text-offset": [0, -1.1] as [number, number],
    },
    paint: {
      "text-color": textColor,
      "text-halo-color": haloColor,
      "text-halo-width": 2.5,
    },
  };
}
