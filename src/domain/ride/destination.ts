import {
  haversineKm,
  initialBearingDeg,
  offsetCoordinates,
} from "@/domain/geo/distance";
import {
  firstCoordinates,
  headingChangePerKm,
  lastCoordinates,
} from "@/domain/geo/geometry";
import type { Coordinates } from "@/domain/geo/types";
import {
  DESTINATION_ENDPOINT_TOLERANCE_KM,
  MAX_DESTINATION_DETOUR_RATIO,
  MIN_DESTINATION_ROAD_POINTS,
} from "./constants";
import {
  excludeUnitedStatesCrossing,
  routeEntersUnitedStates,
  stayInCanadaEnabled,
  waypointSetEntersUnitedStates,
} from "./canada";
import {
  distanceBoundsKm,
  distanceToleranceGapKm,
  isWithinDistanceTolerance,
  usesKnownUnpaved,
} from "./constraints";
import { curvyRankScore } from "./curvy";
import {
  preferAvoidingHighways,
  usesHighway,
  withHighwayAvoidanceSignal,
} from "./highways";
import { scenicRankScore } from "./scenic";
import {
  excludeKnownUnpaved,
  withUnknownSurfaceSignal,
} from "./surfaces";
import { touringRankScore } from "./touring";
import type { DestinationCandidate, RideStyle } from "./types";

export type DestinationWaypointSet = {
  label: string;
  waypoints: Coordinates[];
};

/**
 * FR-002 — seed several corridors between start and destination.
 * Direct, lateral, and (when a target length exists) lengthened paths.
 * The routing provider snaps seeds to the road network.
 */
export function createDestinationWaypointSets(
  start: Coordinates,
  destination: Coordinates,
  targetDistanceKm?: number,
  stayInCanada = false,
): DestinationWaypointSet[] {
  const straightKm = haversineKm(start, destination);
  const bearingDeg = initialBearingDeg(start, destination);
  const leftBearing = bearingDeg + 90;
  const rightBearing = bearingDeg - 90;
  const mid = offsetCoordinates(start, bearingDeg, straightKm / 2);
  const third = offsetCoordinates(start, bearingDeg, straightKm / 3);
  const twoThirds = offsetCoordinates(start, bearingDeg, (2 * straightKm) / 3);

  const sets: DestinationWaypointSet[] = [
    { label: "direct", waypoints: [] },
    {
      label: "lateral-left",
      waypoints: [offsetCoordinates(mid, leftBearing, straightKm * 0.22)],
    },
    {
      label: "lateral-right",
      waypoints: [offsetCoordinates(mid, rightBearing, straightKm * 0.22)],
    },
    {
      label: "wide-left",
      waypoints: [offsetCoordinates(mid, leftBearing, straightKm * 0.38)],
    },
    {
      label: "wide-right",
      waypoints: [offsetCoordinates(mid, rightBearing, straightKm * 0.38)],
    },
    {
      label: "zigzag-left",
      waypoints: [
        offsetCoordinates(third, leftBearing, straightKm * 0.25),
        offsetCoordinates(twoThirds, rightBearing, straightKm * 0.25),
      ],
    },
    {
      label: "zigzag-right",
      waypoints: [
        offsetCoordinates(third, rightBearing, straightKm * 0.25),
        offsetCoordinates(twoThirds, leftBearing, straightKm * 0.25),
      ],
    },
  ];

  if (targetDistanceKm !== undefined && targetDistanceKm > straightKm) {
    const heightKm = offsetHeightForTarget(straightKm, targetDistanceKm);
    if (heightKm > 1) {
      sets.push({
        label: "lengthened-left",
        waypoints: [offsetCoordinates(mid, leftBearing, heightKm)],
      });
      sets.push({
        label: "lengthened-right",
        waypoints: [offsetCoordinates(mid, rightBearing, heightKm)],
      });
    }
  }

  if (!stayInCanadaEnabled(stayInCanada)) {
    return sets;
  }

  return sets.filter(
    (set) => !waypointSetEntersUnitedStates(start, set.waypoints),
  );
}

function offsetHeightForTarget(straightKm: number, targetKm: number): number {
  const halfTarget = targetKm / 2;
  const halfStraight = straightKm / 2;
  if (halfTarget <= halfStraight) {
    return 0;
  }

  const heightKm = Math.sqrt(halfTarget ** 2 - halfStraight ** 2);
  return Math.min(heightKm, straightKm * 1.5);
}

export type EvaluatedDestinationCandidate = {
  candidate: DestinationCandidate;
  startsAtStart: boolean;
  reachesDestination: boolean;
  followsRoadNetwork: boolean;
  withinDistanceTolerance: boolean | null;
  disproportionateDetour: boolean;
  headingChangePerKm: number;
  warnings: string[];
};

function isSnappedToIntendedPlace(
  point: Coordinates,
  intended: Coordinates,
  otherEnd: Coordinates,
): boolean {
  const toIntendedKm = haversineKm(point, intended);
  const toOtherKm = haversineKm(point, otherEnd);
  return (
    toIntendedKm <= DESTINATION_ENDPOINT_TOLERANCE_KM && toIntendedKm < toOtherKm
  );
}

export function evaluateDestinationCandidate(
  start: Coordinates,
  destination: Coordinates,
  candidate: DestinationCandidate,
  options: {
    targetDistanceKm?: number;
    shortestDistanceKm: number;
  },
): EvaluatedDestinationCandidate {
  const first = firstCoordinates(candidate.geometry);
  const last = lastCoordinates(candidate.geometry);
  const startsAtStart =
    first !== null && isSnappedToIntendedPlace(first, start, destination);
  const reachesDestination =
    last !== null && isSnappedToIntendedPlace(last, destination, start);
  const followsRoadNetwork =
    candidate.geometry.coordinates.length >= MIN_DESTINATION_ROAD_POINTS;
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

  if (disproportionateDetour) {
    warnings.push(
      `Ce trajet allonge trop le parcours (${candidate.distanceKm.toFixed(1)} km) par rapport au plus court candidat (${options.shortestDistanceKm.toFixed(1)} km).`,
    );
  }

  return {
    candidate,
    startsAtStart,
    reachesDestination,
    followsRoadNetwork,
    withinDistanceTolerance,
    disproportionateDetour,
    headingChangePerKm: headingChangePerKm(candidate.geometry),
    warnings,
  };
}

export function maxAllowedDestinationDistanceKm(
  shortestDistanceKm: number,
  targetDistanceKm?: number,
): number {
  if (targetDistanceKm === undefined) {
    return shortestDistanceKm * MAX_DESTINATION_DETOUR_RATIO;
  }

  const { maxDistanceKm } = distanceBoundsKm(targetDistanceKm);
  return Math.max(maxDistanceKm, shortestDistanceKm);
}

export function isAnchoredDestination(
  evaluation: EvaluatedDestinationCandidate,
): boolean {
  return (
    evaluation.startsAtStart &&
    evaluation.reachesDestination &&
    evaluation.followsRoadNetwork
  );
}

/**
 * BR-003 — rank by requested style, never by duration / fastest path.
 * Curvy uses FR-004. Scenic uses FR-005. Touring uses FR-006.
 */
export function styleRankScore(
  style: RideStyle,
  evaluation: EvaluatedDestinationCandidate,
): number {
  switch (style) {
    case "fastest":
      // A higher score wins. Negating duration therefore selects the
      // shortest travel time while normal viability constraints remain.
      return -evaluation.candidate.durationMinutes;
    case "curvy":
      return curvyRankScore(
        evaluation.candidate.geometry,
        evaluation.candidate.segments,
      );
    case "scenic":
      return scenicRankScore(
        evaluation.candidate.geometry,
        evaluation.candidate.segments,
      );
    case "touring":
      return touringRankScore(
        evaluation.candidate.geometry,
        evaluation.candidate.segments,
      );
  }
}

export type DestinationSelection =
  | {
      status: "selected";
      evaluation: EvaluatedDestinationCandidate;
    }
  | {
      status: "distance_out_of_tolerance";
      evaluation: EvaluatedDestinationCandidate;
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

export function selectBestDestinationCandidate(
  evaluations: EvaluatedDestinationCandidate[],
  style: RideStyle,
  targetDistanceKm?: number,
  avoidHighways = false,
  avoidUnpaved = false,
  stayInCanada = false,
): DestinationSelection {
  const anchored = evaluations.filter(isAnchoredDestination);
  if (anchored.length === 0) {
    return { status: "no_route_found" };
  }

  const withoutUnpaved = excludeKnownUnpaved(
    anchored,
    (evaluation) => usesKnownUnpaved(evaluation.candidate.segments),
    avoidUnpaved,
  );
  if (avoidUnpaved && anchored.length > 0 && withoutUnpaved.length === 0) {
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
    const scoreDelta =
      styleRankScore(style, right) - styleRankScore(style, left);
    if (scoreDelta !== 0) {
      return scoreDelta;
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
