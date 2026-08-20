import { haversineKm, positionToCoordinates } from "@/domain/geo/distance";
import type { LineString } from "@/domain/geo/types";
import { OVERLAP_CELL_KM } from "./constants";

type EdgeUsage = {
  count: number;
  lengthKm: number;
};

type AccumulatedEdges = {
  usageByEdge: Map<string, EdgeUsage>;
  totalKm: number;
};

function toLocalKm(
  origin: { latitude: number; longitude: number },
  point: { latitude: number; longitude: number },
) {
  const latitudeMid = ((origin.latitude + point.latitude) / 2) * (Math.PI / 180);
  return {
    east: (point.longitude - origin.longitude) * 111.32 * Math.cos(latitudeMid),
    north: (point.latitude - origin.latitude) * 111.32,
  };
}

function quantize(valueKm: number): number {
  return Math.round(valueKm / OVERLAP_CELL_KM);
}

function undirectedEdgeKey(
  origin: { latitude: number; longitude: number },
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): string {
  const a = toLocalKm(origin, from);
  const b = toLocalKm(origin, to);
  const aKey = `${quantize(a.east)},${quantize(a.north)}`;
  const bKey = `${quantize(b.east)},${quantize(b.north)}`;
  return aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
}

function accumulateEdges(geometry: LineString): AccumulatedEdges {
  const first = geometry.coordinates[0];
  const origin = first
    ? positionToCoordinates(first)
    : { latitude: 0, longitude: 0 };
  const usageByEdge = new Map<string, EdgeUsage>();
  let totalKm = 0;

  for (let index = 1; index < geometry.coordinates.length; index += 1) {
    const from = positionToCoordinates(geometry.coordinates[index - 1]);
    const to = positionToCoordinates(geometry.coordinates[index]);
    const lengthKm = haversineKm(from, to);
    if (lengthKm === 0) {
      continue;
    }

    totalKm += lengthKm;
    const key = undirectedEdgeKey(origin, from, to);
    const current = usageByEdge.get(key) ?? { count: 0, lengthKm: 0 };
    usageByEdge.set(key, {
      count: current.count + 1,
      lengthKm: current.lengthKm + lengthKm,
    });
  }

  return { usageByEdge, totalKm };
}

/**
 * BR-002 — share of a single route that reuses the same roadway,
 * including travel in the opposite direction.
 */
export function measureRepeatedRoadPercent(geometry: LineString): number {
  const { usageByEdge, totalKm } = accumulateEdges(geometry);
  if (totalKm === 0) {
    return 0;
  }

  let repeatedKm = 0;
  for (const usage of usageByEdge.values()) {
    if (usage.count > 1) {
      repeatedKm += usage.lengthKm * ((usage.count - 1) / usage.count);
    }
  }

  return (repeatedKm / totalKm) * 100;
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
