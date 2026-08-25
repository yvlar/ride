import { haversineKm, positionToCoordinates } from "@/domain/geo/distance";
import type { Coordinates, LineString } from "@/domain/geo/types";
import { OVERLAP_CELL_KM } from "./constants";

type EdgeUsage = {
  count: number;
  lengthKm: number;
};

type AccumulatedEdges = {
  usageByEdge: Map<string, EdgeUsage>;
  edgeOrigins: Map<string, boolean>;
  totalKm: number;
};

function toLocalKm(point: Coordinates) {
  return {
    east: point.longitude * 111.32 * Math.cos(point.latitude * (Math.PI / 180)),
    north: point.latitude * 111.32,
  };
}

function quantize(valueKm: number): number {
  return Math.round(valueKm / OVERLAP_CELL_KM);
}

function undirectedEdgeKey(from: Coordinates, to: Coordinates): string {
  const a = toLocalKm(from);
  const b = toLocalKm(to);
  const aKey = `${quantize(a.east)},${quantize(a.north)}`;
  const bKey = `${quantize(b.east)},${quantize(b.north)}`;
  return aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
}

function interpolate(
  from: Coordinates,
  to: Coordinates,
  t: number,
): Coordinates {
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * t,
    longitude: from.longitude + (to.longitude - from.longitude) * t,
  };
}

function addEdge(
  usageByEdge: Map<string, EdgeUsage>,
  edgeOrigins: Map<string, boolean>,
  from: Coordinates,
  to: Coordinates,
  origin?: Coordinates,
  originConnectorRadiusKm?: number,
): number {
  const lengthKm = haversineKm(from, to);
  if (lengthKm === 0) {
    return 0;
  }

  const key = undirectedEdgeKey(from, to);
  const current = usageByEdge.get(key) ?? { count: 0, lengthKm: 0 };
  usageByEdge.set(key, {
    count: current.count + 1,
    lengthKm: current.lengthKm + lengthKm,
  });
  if (origin && originConnectorRadiusKm !== undefined) {
    const midpoint = interpolate(from, to, 0.5);
    const nearOrigin =
      haversineKm(origin, midpoint) <= originConnectorRadiusKm &&
      haversineKm(origin, from) <= originConnectorRadiusKm &&
      haversineKm(origin, to) <= originConnectorRadiusKm;
    edgeOrigins.set(key, (edgeOrigins.get(key) ?? true) && nearOrigin);
  }
  return lengthKm;
}

function accumulateEdges(
  geometry: LineString,
  options?: {
    origin: Coordinates;
    originConnectorRadiusKm: number;
  },
): AccumulatedEdges {
  const usageByEdge = new Map<string, EdgeUsage>();
  const edgeOrigins = new Map<string, boolean>();
  let totalKm = 0;

  for (let index = 1; index < geometry.coordinates.length; index += 1) {
    const from = positionToCoordinates(geometry.coordinates[index - 1]);
    const to = positionToCoordinates(geometry.coordinates[index]);
    const lengthKm = haversineKm(from, to);
    const steps = Math.max(1, Math.round(lengthKm / OVERLAP_CELL_KM));

    let previous = from;
    for (let step = 1; step <= steps; step += 1) {
      const current = interpolate(from, to, step / steps);
      totalKm += addEdge(
        usageByEdge,
        edgeOrigins,
        previous,
        current,
        options?.origin,
        options?.originConnectorRadiusKm,
      );
      previous = current;
    }
  }

  return { usageByEdge, edgeOrigins, totalKm };
}

/**
 * BR-002 — share of a single route that reuses the same roadway,
 * including travel in the opposite direction.
 */
export function measureRepeatedRoadPercent(geometry: LineString): number {
  return repeatedRoadShare(geometry).percent;
}

/**
 * BR-011 — repeated share excluding a short origin connector. Opposite
 * direction still matches. Origin-connector edges are ignored in both the
 * repeated numerator and the outside-zone denominator.
 */
export function measureRepeatedRoadPercentBeyondOrigin(
  geometry: LineString,
  origin: Coordinates,
  originConnectorRadiusKm: number,
): number {
  return repeatedRoadShare(geometry, {
    origin,
    originConnectorRadiusKm,
  }).percentOutsideOrigin;
}

type RepeatedRoadShare = {
  percent: number;
  percentOutsideOrigin: number;
};

function repeatedRoadShare(
  geometry: LineString,
  options?: {
    origin: Coordinates;
    originConnectorRadiusKm: number;
  },
): RepeatedRoadShare {
  const { usageByEdge, totalKm, edgeOrigins } = accumulateEdges(
    geometry,
    options,
  );
  if (totalKm === 0) {
    return {
      percent: 0,
      percentOutsideOrigin: 0,
    };
  }

  let repeatedKm = 0;
  let repeatedKmOutsideOrigin = 0;
  let totalKmOutsideOrigin = 0;

  for (const [key, usage] of usageByEdge) {
    const nearOrigin = options ? edgeOrigins.get(key) === true : false;
    if (!nearOrigin) {
      totalKmOutsideOrigin += usage.lengthKm;
    }
    if (usage.count > 1) {
      repeatedKm += usage.lengthKm;
      if (!nearOrigin) {
        repeatedKmOutsideOrigin += usage.lengthKm;
      }
    }
  }

  const outsideDenom = totalKmOutsideOrigin > 0 ? totalKmOutsideOrigin : totalKm;

  return {
    percent: (repeatedKm / totalKm) * 100,
    percentOutsideOrigin: (repeatedKmOutsideOrigin / outsideDenom) * 100,
  };
}

/**
 * BR-002 — overlap between two geometries. Opposite direction still matches.
 */
export function measureOverlapPercent(
  first: LineString,
  second: LineString,
): number {
  const a = accumulateEdges(first);
  const b = accumulateEdges(second);
  if (a.totalKm === 0 || b.totalKm === 0) {
    return 0;
  }

  let matchedKm = 0;
  for (const [key, usage] of a.usageByEdge) {
    const other = b.usageByEdge.get(key);
    if (other !== undefined) {
      matchedKm += Math.min(usage.lengthKm, other.lengthKm);
    }
  }

  return (matchedKm / Math.min(a.totalKm, b.totalKm)) * 100;
}
