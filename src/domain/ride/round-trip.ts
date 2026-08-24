import { joinLineStrings } from "@/domain/geo/geometry";
import type { Coordinates } from "@/domain/geo/types";
import { HIGH_REPEAT_WARNING_PERCENT } from "./constants";
import {
  distanceToleranceGapKm,
  isWithinDistanceTolerance,
  usesKnownUnpaved,
} from "./constraints";
import {
  createDestinationWaypointSets,
  evaluateDestinationCandidate,
  maxAllowedDestinationDistanceKm,
  styleRankScore,
  type DestinationWaypointSet,
} from "./destination";
import {
  preferAvoidingHighways,
  usesHighway,
  withHighwayAvoidanceSignal,
} from "./highways";
import {
  excludeUnitedStatesCrossing,
  routeEntersUnitedStates,
} from "./canada";
import { measureOverlapPercent, measureRepeatedRoadPercent } from "./overlap";
import {
  excludeKnownUnpaved,
  withUnknownSurfaceSignal,
} from "./surfaces";
import { concatNavigationSteps } from "@/domain/navigation/merge";
import type {
  DestinationCandidate,
  RideStyle,
  RoundTripCandidate,
  RouteSegment,
} from "./types";

/**
 * FR-003 — seed return corridors from destination back to start.
 * The provider cannot penalize outbound segments, so opposite / lateral
 * waypoints create a different return (CURSOR.md, BR-004).
 */
export function createReturnWaypointSets(
  start: Coordinates,
  destination: Coordinates,
  targetDistanceKm?: number,
  stayInCanada = false,
): DestinationWaypointSet[] {
  return createDestinationWaypointSets(
    destination,
    start,
    targetDistanceKm,
    stayInCanada,
  );
}

export function composeRoundTripCandidate(
  outbound: DestinationCandidate,
  inbound: DestinationCandidate,
): RoundTripCandidate {
  return {
    outbound,
    inbound,
    geometry: joinLineStrings(outbound.geometry, inbound.geometry),
    segments: joinRoundTripSegments(outbound.segments, inbound.segments),
    steps: concatNavigationSteps(outbound.steps ?? [], inbound.steps ?? []),
    distanceKm: outbound.distanceKm + inbound.distanceKm,
    durationMinutes: outbound.durationMinutes + inbound.durationMinutes,
  };
}

function joinRoundTripSegments(
  outbound: RouteSegment[],
  inbound: RouteSegment[],
): RouteSegment[] {
  return [...outbound, ...inbound];
}

export type EvaluatedRoundTripCandidate = {
  candidate: RoundTripCandidate;
  startsAtStart: boolean;
  visitsDestination: boolean;
  returnsToStart: boolean;
  followsRoadNetwork: boolean;
  withinDistanceTolerance: boolean | null;
  disproportionateDetour: boolean;
  outboundReturnOverlapPercent: number;
  repeatedRoadPercent: number;
  outboundStyleScore: number;
  inboundStyleScore: number;
  warnings: string[];
};

export function evaluateRoundTripCandidate(
  start: Coordinates,
  destination: Coordinates,
  candidate: RoundTripCandidate,
  style: RideStyle,
  options: {
    targetDistanceKm?: number;
    shortestDistanceKm: number;
    shortestOutboundKm: number;
    shortestInboundKm: number;
  },
): EvaluatedRoundTripCandidate {
  const outbound = evaluateDestinationCandidate(
    start,
    destination,
    candidate.outbound,
    { shortestDistanceKm: options.shortestOutboundKm },
  );
  const inbound = evaluateDestinationCandidate(
    destination,
    start,
    candidate.inbound,
    { shortestDistanceKm: options.shortestInboundKm },
  );
  const outboundReturnOverlapPercent = measureOverlapPercent(
    candidate.outbound.geometry,
    candidate.inbound.geometry,
  );
  const repeatedRoadPercent = measureRepeatedRoadPercent(candidate.geometry);
  const withinDistanceTolerance =
    options.targetDistanceKm === undefined
      ? null
      : isWithinDistanceTolerance(candidate.distanceKm, options.targetDistanceKm);
  const allowedMaxKm = maxAllowedDestinationDistanceKm(
    options.shortestDistanceKm,
    options.targetDistanceKm,
  );
  const disproportionateDetour = candidate.distanceKm > allowedMaxKm;
  const warnings: string[] = [];

  if (outboundReturnOverlapPercent >= HIGH_REPEAT_WARNING_PERCENT) {
    warnings.push(
      `Le retour réutilise ${Math.round(outboundReturnOverlapPercent)} % des routes de l’aller. Le réseau près du départ ou de la destination limite les alternatives.`,
    );
  }

  if (disproportionateDetour) {
    warnings.push(
      `Ce trajet allonge trop le parcours (${candidate.distanceKm.toFixed(1)} km) par rapport au plus court candidat (${options.shortestDistanceKm.toFixed(1)} km).`,
    );
  }

  return {
    candidate,
    startsAtStart: outbound.startsAtStart,
    visitsDestination: outbound.reachesDestination && inbound.startsAtStart,
    returnsToStart: inbound.reachesDestination,
    followsRoadNetwork: outbound.followsRoadNetwork && inbound.followsRoadNetwork,
    withinDistanceTolerance,
    disproportionateDetour,
    outboundReturnOverlapPercent,
    repeatedRoadPercent,
    outboundStyleScore: styleRankScore(style, outbound),
    inboundStyleScore: styleRankScore(style, inbound),
    warnings,
  };
}

export function isViableRoundTrip(
  evaluation: EvaluatedRoundTripCandidate,
): boolean {
  return (
    evaluation.startsAtStart &&
    evaluation.visitsDestination &&
    evaluation.returnsToStart &&
    evaluation.followsRoadNetwork
  );
}

export type RoundTripSelection =
  | {
      status: "selected";
      evaluation: EvaluatedRoundTripCandidate;
    }
  | {
      status: "distance_out_of_tolerance";
      evaluation: EvaluatedRoundTripCandidate;
    }
  | {
      status: "no_route_found";
    }
  | {
      status: "known_unpaved_rejected";
    }
  | {
      status: "canada_only_rejected";
    };

/**
 * BR-002 first: prefer a return that is substantially different from the outbound.
 * BR-003 second: among distinct pairs, keep the style-led motorcycle corridors.
 */
export function selectBestRoundTripCandidate(
  evaluations: EvaluatedRoundTripCandidate[],
  targetDistanceKm?: number,
  avoidHighways = false,
  avoidUnpaved = false,
  stayInCanada = false,
): RoundTripSelection {
  const viable = evaluations.filter(isViableRoundTrip);
  if (viable.length === 0) {
    return { status: "no_route_found" };
  }

  const withoutUnpaved = excludeKnownUnpaved(
    viable,
    (evaluation) => usesKnownUnpaved(evaluation.candidate.segments),
    avoidUnpaved,
  );
  if (avoidUnpaved && viable.length > 0 && withoutUnpaved.length === 0) {
    return { status: "known_unpaved_rejected" };
  }
  const withoutUnitedStates = excludeUnitedStatesCrossing(
    withoutUnpaved,
    (evaluation) => routeEntersUnitedStates(evaluation.candidate),
    stayInCanada,
  );
  if (
    stayInCanada &&
    withoutUnpaved.length > 0 &&
    withoutUnitedStates.length === 0
  ) {
    return { status: "canada_only_rejected" };
  }

  const reasonable = withoutUnitedStates.filter(
    (evaluation) => !evaluation.disproportionateDetour,
  );
  const pool = reasonable.length > 0 ? reasonable : withoutUnitedStates;
  const inTolerance =
    targetDistanceKm === undefined
      ? pool
      : pool.filter((evaluation) => evaluation.withinDistanceTolerance === true);
  const rankedPool = preferAvoidingHighways(
    inTolerance.length > 0 ? inTolerance : pool,
    (evaluation) => usesHighway(evaluation.candidate.segments),
    avoidHighways,
  );

  const ranked = [...rankedPool].sort((left, right) => {
    if (left.outboundReturnOverlapPercent !== right.outboundReturnOverlapPercent) {
      return left.outboundReturnOverlapPercent - right.outboundReturnOverlapPercent;
    }
    const outboundStyleDelta = right.outboundStyleScore - left.outboundStyleScore;
    if (outboundStyleDelta !== 0) {
      return outboundStyleDelta;
    }
    const inboundStyleDelta = right.inboundStyleScore - left.inboundStyleScore;
    if (inboundStyleDelta !== 0) {
      return inboundStyleDelta;
    }
    if (targetDistanceKm !== undefined) {
      return (
        distanceToleranceGapKm(left.candidate.distanceKm, targetDistanceKm) -
        distanceToleranceGapKm(right.candidate.distanceKm, targetDistanceKm)
      );
    }
    return left.candidate.distanceKm - right.candidate.distanceKm;
  });

  const best = ranked[0];
  if (!best) {
    return { status: "no_route_found" };
  }

  if (
    targetDistanceKm !== undefined &&
    best.withinDistanceTolerance !== true
  ) {
    return { status: "distance_out_of_tolerance", evaluation: best };
  }

  return {
    status: "selected",
    evaluation: withUnknownSurfaceSignal(
      withHighwayAvoidanceSignal(best, avoidHighways),
    ),
  };
}
