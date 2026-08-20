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
  MIN_ROAD_NETWORK_POINTS,
  TOURING_TARGET_HEADING_CHANGE_PER_KM,
} from "./constants";
import { distanceBoundsKm, distanceToleranceGapKm, isWithinDistanceTolerance } from "./constraints";
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

  return sets;
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
    first !== null &&
    haversineKm(start, first) <= DESTINATION_ENDPOINT_TOLERANCE_KM;
  const reachesDestination =
    last !== null &&
    haversineKm(destination, last) <= DESTINATION_ENDPOINT_TOLERANCE_KM;
  const followsRoadNetwork =
    candidate.geometry.coordinates.length >= MIN_ROAD_NETWORK_POINTS;
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
 * This is only enough ranking for FR-002; it is not the full FR-004/005/006
 * corridor generators.
 */
export function styleRankScore(
  style: RideStyle,
  evaluation: EvaluatedDestinationCandidate,
  shortestDistanceKm: number,
): number {
  const twist = evaluation.headingChangePerKm;
  const relativeLength =
    shortestDistanceKm === 0
      ? 1
      : evaluation.candidate.distanceKm / shortestDistanceKm;

  switch (style) {
    case "curvy":
      return twist;
    case "scenic":
      return twist * 0.55 + (relativeLength - 1) * 8;
    case "touring":
      return (
        -Math.abs(twist - TOURING_TARGET_HEADING_CHANGE_PER_KM) -
        relativeLength * 0.15
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
    };

export function selectBestDestinationCandidate(
  evaluations: EvaluatedDestinationCandidate[],
  style: RideStyle,
  targetDistanceKm?: number,
): DestinationSelection {
  const anchored = evaluations.filter(isAnchoredDestination);
  if (anchored.length === 0) {
    return { status: "no_route_found" };
  }

  const shortestDistanceKm = Math.min(
    ...anchored.map((evaluation) => evaluation.candidate.distanceKm),
  );
  const reasonable = anchored.filter(
    (evaluation) => !evaluation.disproportionateDetour,
  );
  const pool = reasonable.length > 0 ? reasonable : anchored;

  const inTolerance =
    targetDistanceKm === undefined
      ? pool
      : pool.filter((evaluation) => evaluation.withinDistanceTolerance === true);
  const rankedPool = inTolerance.length > 0 ? inTolerance : pool;

  const ranked = [...rankedPool].sort((left, right) => {
    const scoreDelta =
      styleRankScore(style, right, shortestDistanceKm) -
      styleRankScore(style, left, shortestDistanceKm);
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

  return { status: "selected", evaluation: best };
}
