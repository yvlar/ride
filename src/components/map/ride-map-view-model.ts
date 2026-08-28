import { boundingBox } from "@/domain/geo/bounds";
import {
  haversineKm,
  initialBearingDeg,
  positionToCoordinates,
} from "@/domain/geo/distance";
import type { BoundingBox, Coordinates, LineString } from "@/domain/geo/types";
import type { GpxMapOverlay } from "@/domain/gpx/types";
import { isGpxRoute } from "@/domain/gpx/types";
import { splitLineStringAtKm } from "@/domain/navigation/route-split";
import type { GeneratedRideRoute } from "@/domain/ride/types";

export type RideMapMarker = {
  kind: "start" | "destination" | "entry";
  label: string;
  placeLabel: string;
  coordinates: Coordinates;
};

export type RideMapArrow = {
  coordinates: Coordinates;
  bearingDeg: number;
};

export type RideMapViewModel = {
  geometry: LineString;
  parts?: LineString[];
  connectorGeometry?: LineString;
  entryPoint?: Coordinates;
  bounds: BoundingBox;
  start: RideMapMarker;
  destination?: RideMapMarker;
  entry?: RideMapMarker;
  directionLabel: string;
  directionArrows: RideMapArrow[];
  idle?: boolean;
  /**
   * FR-041 — distance already ridden. Drives the dimmed "behind you" line so
   * the rider can tell at a glance which way the route continues.
   */
  traveledKm?: number;
  traveledGeometry?: LineString;
  /** The still-to-ride portion, drawn in the live route colour. */
  remainingGeometry?: LineString;
};

export type MapCameraFrame = {
  bounds: [[number, number], [number, number]];
  fitBoundsOptions: { padding: number; duration: number };
};

/** Initial camera so the map never opens on the default world view (FR-013). */
export function mapCameraFrame(bounds: BoundingBox): MapCameraFrame {
  return {
    bounds: [
      [bounds.west, bounds.south],
      [bounds.east, bounds.north],
    ],
    fitBoundsOptions: { padding: 48, duration: 0 },
  };
}

export function toRideMapViewModel(
  route: GeneratedRideRoute,
  overlay?: GpxMapOverlay | null,
  traveledKm = 0,
): RideMapViewModel | null {
  if (route.geometry.coordinates.length < 2) {
    return null;
  }

  const extra = [route.start.coordinates];
  if (route.type !== "loop") {
    extra.push(route.destination.coordinates);
  }
  if (overlay?.entryPoint) {
    extra.push(overlay.entryPoint);
  }

  const parts = isGpxRoute(route) ? route.parts : undefined;
  const geometryForBounds = parts && parts.length > 0 ? parts[0]! : route.geometry;
  const partExtras: Coordinates[] = [];
  if (parts) {
    for (const part of parts) {
      for (const position of part.coordinates) {
        partExtras.push({ longitude: position[0], latitude: position[1] });
      }
    }
  }
  if (overlay?.connectorGeometry) {
    for (const position of overlay.connectorGeometry.coordinates) {
      partExtras.push({ longitude: position[0], latitude: position[1] });
    }
  }

  const bounds = boundingBox(geometryForBounds, [...extra, ...partExtras]);
  if (!bounds) {
    return null;
  }

  const start: RideMapMarker = {
    kind: "start",
    label: "Départ",
    placeLabel: route.start.label,
    coordinates: route.start.coordinates,
  };

  const destination: RideMapMarker | undefined =
    route.type === "loop"
      ? undefined
      : {
          kind: "destination",
          label: "Destination",
          placeLabel: route.destination.label,
          coordinates: route.destination.coordinates,
        };

  const entry: RideMapMarker | undefined = overlay?.entryPoint
    ? {
        kind: "entry",
        label: "Entrée GPX",
        placeLabel: "Point d’entrée",
        coordinates: overlay.entryPoint,
      }
    : undefined;

  // A GPX trace is drawn as disjoint parts; splitting it would re-join the
  // gaps the importer deliberately kept (FR-039).
  const splittable = !parts || parts.length === 0;
  const traveled =
    splittable && traveledKm > 0
      ? splitLineStringAtKm(route.geometry, traveledKm)
      : null;

  return {
    geometry: route.geometry,
    parts,
    connectorGeometry: overlay?.connectorGeometry ?? undefined,
    entryPoint: overlay?.entryPoint ?? undefined,
    bounds,
    start,
    destination,
    entry,
    directionLabel: directionLabel(route),
    directionArrows: sampleDirectionArrows(
      parts && parts.length > 0
        ? { type: "LineString", coordinates: parts.flatMap((part) => part.coordinates) }
        : route.geometry,
    ),
    traveledKm: traveled ? traveledKm : undefined,
    traveledGeometry: traveled?.traveled,
    remainingGeometry: traveled?.remaining,
  };
}

export const DEFAULT_EXPLORER_CENTER: Coordinates = {
  latitude: 45.5,
  longitude: -72.75,
};

/** FR-031 — map-first explorer before a route exists. */
export function idleMapViewModel(
  center: Coordinates = DEFAULT_EXPLORER_CENTER,
): RideMapViewModel {
  const span = 0.45;
  return {
    idle: true,
    geometry: {
      type: "LineString",
      coordinates: [
        [center.longitude, center.latitude],
        [center.longitude + 0.0001, center.latitude],
      ],
    },
    bounds: {
      west: center.longitude - span,
      south: center.latitude - span * 0.7,
      east: center.longitude + span,
      north: center.latitude + span * 0.7,
    },
    start: {
      kind: "start",
      label: "",
      placeLabel: "",
      coordinates: center,
    },
    directionLabel: "",
    directionArrows: [],
  };
}

function directionLabel(route: GeneratedRideRoute): string {
  if (route.type === "gpx") {
    return `Sens GPX : ${route.name}`;
  }
  if (route.type === "loop") {
    return `Sens : boucle depuis ${route.start.label}`;
  }
  if (route.type === "round_trip") {
    return `Sens : ${route.start.label} → ${route.destination.label} → ${route.start.label}`;
  }
  return `Sens : ${route.start.label} → ${route.destination.label}`;
}

export function sampleDirectionArrows(
  geometry: LineString,
  fractions: number[] = [0.25, 0.5, 0.75],
): RideMapArrow[] {
  const arrows: RideMapArrow[] = [];
  for (const fraction of fractions) {
    const sampled = interpolateAlongLine(geometry, fraction);
    if (sampled) {
      arrows.push(sampled);
    }
  }
  return arrows;
}

function interpolateAlongLine(
  geometry: LineString,
  fraction: number,
): RideMapArrow | null {
  if (geometry.coordinates.length < 2) {
    return null;
  }

  const points = geometry.coordinates.map(positionToCoordinates);
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    distances.push(
      distances[index - 1]! + haversineKm(points[index - 1]!, points[index]!),
    );
  }

  const total = distances[distances.length - 1]!;
  if (total === 0) {
    return null;
  }

  const target = total * fraction;
  for (let index = 1; index < points.length; index += 1) {
    if (distances[index]! < target) {
      continue;
    }

    const from = points[index - 1]!;
    const to = points[index]!;
    const segment = distances[index]! - distances[index - 1]!;
    const t = segment === 0 ? 0 : (target - distances[index - 1]!) / segment;

    return {
      coordinates: {
        latitude: from.latitude + (to.latitude - from.latitude) * t,
        longitude: from.longitude + (to.longitude - from.longitude) * t,
      },
      bearingDeg: initialBearingDeg(from, to),
    };
  }

  const last = points[points.length - 1]!;
  const previous = points[points.length - 2]!;
  return {
    coordinates: last,
    bearingDeg: initialBearingDeg(previous, last),
  };
}

export type RideRouteFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, never>;
    geometry: LineString;
  }>;
};

function featureCollection(lines: LineString[]): RideRouteFeatureCollection {
  return {
    type: "FeatureCollection",
    features: lines.map((geometry) => ({
      type: "Feature" as const,
      properties: {},
      geometry,
    })),
  };
}

export function rideRouteFeatureCollection(
  viewModel: RideMapViewModel,
): RideRouteFeatureCollection {
  if (viewModel.idle) {
    return featureCollection([]);
  }
  if (viewModel.parts && viewModel.parts.length > 0) {
    return featureCollection(viewModel.parts);
  }
  // Once the rider has progressed, the live line covers only what is left,
  // so the dimmed traveled line underneath stays visible (FR-041).
  const remaining = viewModel.remainingGeometry;
  if (remaining && remaining.coordinates.length >= 2) {
    return featureCollection([remaining]);
  }
  return featureCollection([viewModel.geometry]);
}

/**
 * FR-041 — the ridden portion, drawn dimmed beneath the live route so the two
 * read as one line with a clear "you are here" break.
 */
export function rideTraveledFeatureCollection(
  viewModel: RideMapViewModel,
): RideRouteFeatureCollection {
  const traveled = viewModel.traveledGeometry;
  if (viewModel.idle || !traveled || traveled.coordinates.length < 2) {
    return featureCollection([]);
  }
  return featureCollection([traveled]);
}
