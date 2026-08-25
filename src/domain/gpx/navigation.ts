import type { Coordinates, LineString } from "@/domain/geo/types";
import type { LocationFix, NavigationStep } from "@/domain/navigation/types";
import type { ProviderRouteResult } from "@/infrastructure/routing/routing-provider";
import {
  FOLLOWING_GPX_MESSAGE,
  GPX_COMPLETED_MESSAGE,
  JOINING_GPX_MESSAGE,
  OFF_GPX_MESSAGE,
} from "./copy";
import {
  findGpxEntryPoint,
  isCloseEnoughToGpx,
  shouldCompleteGpxFollow,
  sliceGpxFromEntry,
  startGpxFromFix,
} from "./follow";
import type {
  GeneratedGpxRoute,
  GpxEntryPoint,
  GpxMapOverlay,
  GpxNavigationPhase,
} from "./types";

export type GpxConnectorRoute = {
  geometry: LineString;
  steps: NavigationStep[];
  distanceKm: number;
  durationMinutes: number;
};

export type LiveGpxRuntime = {
  phase: GpxNavigationPhase;
  original: GeneratedGpxRoute;
  followRoute: GeneratedGpxRoute;
  entry: GpxEntryPoint | null;
  connector: GpxConnectorRoute | null;
  progressKm: number;
  offRoute: boolean;
};

export function liveRuntimeFromOriginal(route: GeneratedGpxRoute): LiveGpxRuntime {
  return {
    phase: "gpx_preview",
    original: route,
    followRoute: route,
    entry: null,
    connector: null,
    progressKm: 0,
    offRoute: false,
  };
}

export function gpxMapOverlay(runtime: LiveGpxRuntime | null): GpxMapOverlay | null {
  if (!runtime) {
    return null;
  }
  const showEntry =
    runtime.phase === "joining_gpx" ||
    runtime.phase === "gpx_preview" ||
    runtime.offRoute;
  return {
    phase: runtime.phase,
    connectorGeometry: runtime.connector?.geometry ?? null,
    entryPoint: showEntry ? (runtime.entry?.point ?? null) : null,
  };
}

export function gpxStatusLabel(
  phase: GpxNavigationPhase,
  offRoute: boolean,
): string {
  if (offRoute) {
    return OFF_GPX_MESSAGE;
  }
  if (phase === "joining_gpx") {
    return JOINING_GPX_MESSAGE;
  }
  if (phase === "gpx_completed") {
    return GPX_COMPLETED_MESSAGE;
  }
  return FOLLOWING_GPX_MESSAGE;
}

export function connectorFromProvider(
  route: ProviderRouteResult,
): GpxConnectorRoute {
  return {
    geometry: route.geometry,
    steps: route.steps ?? [],
    distanceKm: route.distanceKm,
    durationMinutes: route.durationMinutes,
  };
}

export function combinedRemainingKm(
  connectorRemainingKm: number,
  followRemainingKm: number,
): number {
  return Math.max(0, connectorRemainingKm) + Math.max(0, followRemainingKm);
}

export function beginGpxFromFix(
  original: GeneratedGpxRoute,
  fix: LocationFix,
): { runtime: LiveGpxRuntime; joinTo: Coordinates | null } {
  const started = startGpxFromFix({ original, fix });
  return {
    joinTo: started.joinTo,
    runtime: {
      phase: started.runtime.phase,
      original,
      followRoute: started.runtime.followRoute,
      entry: started.runtime.entry,
      connector: null,
      progressKm: 0,
      offRoute: false,
    },
  };
}

/**
 * If the rider is on the remaining GPX (join complete or cut onto the
 * trace), switch to FOLLOWING_GPX without asking OSRM to replace it.
 * Once following_gpx has started, keep that slice: later GPS fixes
 * advance progress instead of re-slicing (FR-039 monotone follow).
 */
export function enterFollowingIfOnTrace(input: {
  runtime: LiveGpxRuntime;
  fix: LocationFix;
}): LiveGpxRuntime | null {
  if (input.runtime.phase === "gpx_completed") {
    return null;
  }
  if (input.runtime.phase === "following_gpx") {
    return null;
  }
  const remaining: GeneratedGpxRoute = {
    ...input.runtime.followRoute,
    originalGeometry: input.runtime.followRoute.geometry,
    originalParts: input.runtime.followRoute.parts,
    isClosedLoop: false,
  };
  const entry = findGpxEntryPoint({
    point: input.fix.coordinates,
    geometry: remaining.geometry,
    gapBeforeVertex: remaining.gapBeforeVertex,
    headingDeg: input.fix.headingDeg,
  });
  if (!entry) {
    return null;
  }
  if (!isCloseEnoughToGpx(entry.distanceM, input.fix.accuracyMeters)) {
    return null;
  }
  if (entry.progressKm + 0.05 < input.runtime.progressKm) {
    return null;
  }
  const followRoute = sliceGpxFromEntry({ route: remaining, entry });
  const next: LiveGpxRuntime = {
    ...input.runtime,
    phase: "following_gpx",
    followRoute,
    connector: null,
    progressKm: 0,
    offRoute: false,
    entry: input.runtime.entry ?? entry,
  };
  return next;
}

export function markGpxCompleted(runtime: LiveGpxRuntime): LiveGpxRuntime {
  return {
    ...runtime,
    phase: "gpx_completed",
    connector: null,
    offRoute: false,
  };
}

export function attachGpxConnector(
  runtime: LiveGpxRuntime,
  connector: GpxConnectorRoute,
  joinTo: Coordinates,
): LiveGpxRuntime {
  return {
    ...runtime,
    phase: "joining_gpx",
    connector,
    offRoute: runtime.offRoute,
    entry: runtime.entry ?? {
      point: joinTo,
      segmentIndex: 0,
      t: 0,
      progressKm: 0,
      distanceM: 0,
    },
  };
}

export function followProgressComplete(
  remainingDistanceKm: number,
  accuracyMeters: number,
): boolean {
  return shouldCompleteGpxFollow({ remainingDistanceKm, accuracyMeters });
}
