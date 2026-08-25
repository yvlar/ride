import {
  coordinatesToPosition,
  haversineKm,
  lineStringLengthKm,
  positionToCoordinates,
} from "@/domain/geo/distance";
import { nearestPointOnLine } from "@/domain/geo/nearest-point";
import type { Coordinates, LineString } from "@/domain/geo/types";
import {
  PROGRESS_MATCH_PENALTY_M_PER_KM,
} from "@/domain/navigation/constants";
import { selectRejoinDistanceKm } from "@/domain/navigation/merge";
import type { LocationFix } from "@/domain/navigation/types";
import { stepsFromGpxPath } from "./steps";
import { navigableLengthKm } from "./compose";
import {
  GPX_HEADING_PENALTY_M,
  GPX_JOIN_ARRIVAL_ACCURACY_MULTIPLIER,
  GPX_JOIN_ARRIVAL_MIN_M,
  GPX_PROJECTION_TIE_M,
  GPX_REVERSE_PROGRESS_PENALTY_M,
  GPX_VERTEX_INSERT_EPS,
} from "./constants";
import type { GeneratedGpxRoute, GpxEntryPoint, GpxNavigationPhase } from "./types";
import { agentDebugLog } from "./_agent-debug-log";

export function gpxJoinArrivalThresholdM(accuracyMeters: number): number {
  const accuracy = Number.isFinite(accuracyMeters) ? accuracyMeters : 0;
  return Math.max(
    GPX_JOIN_ARRIVAL_MIN_M,
    accuracy * GPX_JOIN_ARRIVAL_ACCURACY_MULTIPLIER,
  );
}

export function isCloseEnoughToGpx(
  distanceM: number,
  accuracyMeters: number,
): boolean {
  return distanceM <= gpxJoinArrivalThresholdM(accuracyMeters);
}

export function findGpxEntryPoint(input: {
  point: Coordinates;
  geometry: LineString;
  gapBeforeVertex?: readonly number[];
  headingDeg?: number | null;
}): GpxEntryPoint | null {
  const nearest = nearestPointOnLine(input.point, input.geometry, {
    headingDeg: input.headingDeg,
    gapBeforeVertex: new Set(input.gapBeforeVertex ?? []),
    tieDistanceM: GPX_PROJECTION_TIE_M,
    headingPenaltyM: GPX_HEADING_PENALTY_M,
    reversePenaltyM: GPX_REVERSE_PROGRESS_PENALTY_M,
    progressPenaltyMPerKm: PROGRESS_MATCH_PENALTY_M_PER_KM,
  });
  if (!nearest) {
    return null;
  }
  const entry: GpxEntryPoint = {
    point: nearest.point,
    segmentIndex: nearest.segmentIndex,
    t: nearest.t,
    progressKm: nearest.progressKm,
    distanceM: nearest.distanceM,
  };
  // #region agent log
  agentDebugLog({
    hypothesisId: "H4",
    location: "follow.ts:findGpxEntryPoint",
    message: "findGpxEntryPoint projection",
    data: {
      segmentIndex: entry.segmentIndex,
      t: entry.t,
      progressKm: entry.progressKm,
      distanceM: entry.distanceM,
      geomPoints: input.geometry.coordinates.length,
      headingDeg: input.headingDeg ?? null,
      previousProgressKmPassed: false,
    },
  });
  // #endregion
  return entry;
}

export function insertProjectedVertex(
  geometry: LineString,
  entry: Pick<GpxEntryPoint, "segmentIndex" | "t" | "point">,
): { geometry: LineString; vertexIndex: number; shiftedGaps: (gaps: readonly number[]) => number[] } {
  const coordinates = [...geometry.coordinates];
  let vertexIndex = entry.segmentIndex;
  let inserted = false;
  if (entry.t <= GPX_VERTEX_INSERT_EPS) {
    vertexIndex = entry.segmentIndex;
  } else if (entry.t >= 1 - GPX_VERTEX_INSERT_EPS) {
    vertexIndex = entry.segmentIndex + 1;
  } else {
    vertexIndex = entry.segmentIndex + 1;
    coordinates.splice(
      vertexIndex,
      0,
      coordinatesToPosition(entry.point),
    );
    inserted = true;
  }
  return {
    geometry: { type: "LineString", coordinates },
    vertexIndex,
    shiftedGaps(gaps) {
      if (!inserted) {
        return [...gaps];
      }
      return gaps.map((index) => (index >= vertexIndex ? index + 1 : index));
    },
  };
}

export function sliceGpxFromEntry(input: {
  route: GeneratedGpxRoute;
  entry: GpxEntryPoint;
}): GeneratedGpxRoute {
  const inserted = insertProjectedVertex(input.route.originalGeometry, input.entry);
  const gaps = new Set(inserted.shiftedGaps(input.route.gapBeforeVertex));
  const source = inserted.geometry.coordinates;
  const start = inserted.vertexIndex;
  const sliced: LineString["coordinates"] = [source[start] ?? coordinatesToPosition(input.entry.point)];
  const slicedGaps: number[] = [];

  function pushFrom(fromIndex: number, toIndex: number) {
    for (let index = fromIndex + 1; index <= toIndex; index += 1) {
      const coord = source[index];
      if (!coord) {
        continue;
      }
      if (gaps.has(index)) {
        slicedGaps.push(sliced.length);
      }
      sliced.push(coord);
    }
  }

  pushFrom(start, source.length - 1);
  if (input.route.isClosedLoop && start > 0) {
    const last = sliced[sliced.length - 1];
    const first = source[0];
    if (
      first &&
      (!last || last[0] !== first[0] || last[1] !== first[1])
    ) {
      sliced.push(first);
    }
    pushFrom(0, start);
  }

  const geometry: LineString = { type: "LineString", coordinates: dedupe(sliced) };
  const remappedGaps = remapGapsAfterDedupe(sliced, slicedGaps);
  const distanceKm = navigableLengthKm(geometry, remappedGaps);
  const parts = splitParts(geometry, remappedGaps);
  const follow: GeneratedGpxRoute = {
    ...input.route,
    isClosedLoop: false,
    geometry,
    parts,
    gapBeforeVertex: remappedGaps,
    distanceKm,
    durationMinutes:
      input.route.distanceKm > 0
        ? input.route.durationMinutes * (distanceKm / input.route.distanceKm)
        : input.route.durationMinutes,
    segments: input.route.segments,
    steps: stepsFromGpxPath(geometry, input.route.segments),
    start: {
      label: input.route.name,
      coordinates: positionToCoordinates(geometry.coordinates[0]!),
    },
    destination: {
      label: input.route.isClosedLoop ? input.route.name : "Arrivée GPX",
      coordinates: positionToCoordinates(
        geometry.coordinates[geometry.coordinates.length - 1]!,
      ),
    },
  };
  return follow;
}

function dedupe(
  coordinates: LineString["coordinates"],
): LineString["coordinates"] {
  const unique: LineString["coordinates"] = [];
  for (const position of coordinates) {
    const last = unique[unique.length - 1];
    if (last && last[0] === position[0] && last[1] === position[1]) {
      continue;
    }
    unique.push(position);
  }
  return unique;
}

function remapGapsAfterDedupe(
  before: LineString["coordinates"],
  gaps: number[],
): number[] {
  // Dedupe only drops exact consecutive duplicates; gap indices stay valid
  // when we skip those duplicates during reconstruction. Rebuild from flags.
  const flags = new Set(gaps);
  const remapped: number[] = [];
  const unique: LineString["coordinates"] = [];
  before.forEach((position, index) => {
    const last = unique[unique.length - 1];
    if (last && last[0] === position[0] && last[1] === position[1]) {
      return;
    }
    if (flags.has(index) && unique.length > 0) {
      remapped.push(unique.length);
    }
    unique.push(position);
  });
  return remapped;
}

function splitParts(geometry: LineString, gaps: readonly number[]): LineString[] {
  if (geometry.coordinates.length < 2) {
    return [];
  }
  const gapSet = new Set(gaps);
  const parts: LineString[] = [];
  let current: LineString["coordinates"] = [geometry.coordinates[0]!];
  for (let index = 1; index < geometry.coordinates.length; index += 1) {
    if (gapSet.has(index) && current.length >= 2) {
      parts.push({ type: "LineString", coordinates: current });
      current = [geometry.coordinates[index]!];
      continue;
    }
    if (gapSet.has(index)) {
      current = [geometry.coordinates[index]!];
      continue;
    }
    current.push(geometry.coordinates[index]!);
  }
  if (current.length >= 2) {
    parts.push({ type: "LineString", coordinates: current });
  }
  return parts.length > 0 ? parts : [geometry];
}

export function selectGpxRejoinPoint(input: {
  geometry: LineString;
  gapBeforeVertex: readonly number[];
  progressKm: number;
}): Coordinates | null {
  const remaining = remainingNavigableGeometry(
    input.geometry,
    input.gapBeforeVertex,
    input.progressKm,
  );
  const remainingKm = navigableLengthKm(remaining.geometry, remaining.gapBeforeVertex);
  const aheadKm = selectRejoinDistanceKm(remainingKm);
  return pointAlongNavigable(remaining.geometry, remaining.gapBeforeVertex, aheadKm);
}

export function remainingNavigableGeometry(
  geometry: LineString,
  gapBeforeVertex: readonly number[],
  progressKm: number,
): { geometry: LineString; gapBeforeVertex: number[] } {
  const nearest = nearestPointOnLine(
    pointAlongNavigable(geometry, gapBeforeVertex, progressKm) ??
      positionToCoordinates(geometry.coordinates[0]!),
    geometry,
    {
      previousProgressKm: progressKm,
      gapBeforeVertex: new Set(gapBeforeVertex),
    },
  );
  if (!nearest) {
    return { geometry, gapBeforeVertex: [...gapBeforeVertex] };
  }
  const dummyRoute: GeneratedGpxRoute = {
    id: "tmp",
    type: "gpx",
    source: "gpx",
    name: "",
    start: { label: "", coordinates: nearest.point },
    destination: { label: "", coordinates: nearest.point },
    style: "touring",
    geometry,
    parts: [geometry],
    gapBeforeVertex: [...gapBeforeVertex],
    segments: [],
    distanceKm: navigableLengthKm(geometry, gapBeforeVertex),
    durationMinutes: 0,
    warnings: [],
    isClosedLoop: false,
    trackKind: "track",
    originalGeometry: geometry,
    originalParts: [geometry],
  };
  const sliced = sliceGpxFromEntry({
    route: dummyRoute,
    entry: {
      point: nearest.point,
      segmentIndex: nearest.segmentIndex,
      t: nearest.t,
      progressKm: nearest.progressKm,
      distanceM: nearest.distanceM,
    },
  });
  return { geometry: sliced.geometry, gapBeforeVertex: sliced.gapBeforeVertex };
}

export function pointAlongNavigable(
  geometry: LineString,
  gapBeforeVertex: readonly number[],
  distanceKm: number,
): Coordinates | null {
  if (geometry.coordinates.length === 0) {
    return null;
  }
  const gaps = new Set(gapBeforeVertex);
  if (distanceKm <= 0) {
    return positionToCoordinates(geometry.coordinates[0]!);
  }
  let remaining = distanceKm;
  for (let index = 1; index < geometry.coordinates.length; index += 1) {
    if (gaps.has(index)) {
      continue;
    }
    const from = positionToCoordinates(geometry.coordinates[index - 1]!);
    const to = positionToCoordinates(geometry.coordinates[index]!);
    const segmentKm = haversineKm(from, to);
    if (remaining <= segmentKm) {
      const t = segmentKm === 0 ? 0 : remaining / segmentKm;
      return {
        latitude: from.latitude + (to.latitude - from.latitude) * t,
        longitude: from.longitude + (to.longitude - from.longitude) * t,
      };
    }
    remaining -= segmentKm;
  }
  return positionToCoordinates(
    geometry.coordinates[geometry.coordinates.length - 1]!,
  );
}

export type GpxRuntime = {
  phase: GpxNavigationPhase;
  original: GeneratedGpxRoute;
  followRoute: GeneratedGpxRoute;
  entry: GpxEntryPoint | null;
  connectorGeometry: LineString | null;
  progressKm: number;
};

export function createGpxPreviewRuntime(route: GeneratedGpxRoute): GpxRuntime {
  return {
    phase: "gpx_preview",
    original: route,
    followRoute: route,
    entry: null,
    connectorGeometry: null,
    progressKm: 0,
  };
}

export function startGpxFromFix(input: {
  original: GeneratedGpxRoute;
  fix: LocationFix;
}): { runtime: GpxRuntime; joinTo: Coordinates | null } {
  const entry = findGpxEntryPoint({
    point: input.fix.coordinates,
    geometry: input.original.originalGeometry,
    gapBeforeVertex: input.original.gapBeforeVertex,
    headingDeg: input.fix.headingDeg,
  });
  if (!entry) {
    return {
      runtime: {
        ...createGpxPreviewRuntime(input.original),
        phase: "joining_gpx",
      },
      joinTo: positionToCoordinates(input.original.originalGeometry.coordinates[0]!),
    };
  }
  const followRoute = sliceGpxFromEntry({ route: input.original, entry });
  if (isCloseEnoughToGpx(entry.distanceM, input.fix.accuracyMeters)) {
    return {
      runtime: {
        phase: "following_gpx",
        original: input.original,
        followRoute,
        entry,
        connectorGeometry: null,
        progressKm: 0,
      },
      joinTo: null,
    };
  }
  return {
    runtime: {
      phase: "joining_gpx",
      original: input.original,
      followRoute,
      entry,
      connectorGeometry: null,
      progressKm: 0,
    },
    joinTo: entry.point,
  };
}

export function shouldCompleteGpxFollow(input: {
  remainingDistanceKm: number;
  accuracyMeters: number;
}): boolean {
  return input.remainingDistanceKm * 1_000 <= gpxJoinArrivalThresholdM(input.accuracyMeters);
}

export { lineStringLengthKm };
