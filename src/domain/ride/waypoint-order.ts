import { haversineKm } from "@/domain/geo/distance";
import type { Coordinates } from "@/domain/geo/types";

const MAX_EXACT_WAYPOINTS = 8;
const DISTANCE_EPSILON_KM = 0.000_001;

/**
 * Order a small AI-selected waypoint set as the shortest closed chain from
 * the start. Removing crossings here prevents the road router from faithfully
 * turning an unordered model reply into a zigzagging loop.
 */
export function orderLoopWaypoints(
  start: Coordinates,
  waypoints: Coordinates[],
): Coordinates[] {
  return shortestWaypointOrder(start, start, waypoints);
}

/**
 * Order intermediate points while keeping the AI-selected arrival fixed.
 */
export function orderOneWayWaypoints(
  start: Coordinates,
  destination: Coordinates,
  waypoints: Coordinates[],
): Coordinates[] {
  return shortestWaypointOrder(start, destination, waypoints);
}

function shortestWaypointOrder(
  start: Coordinates,
  destination: Coordinates,
  waypoints: Coordinates[],
): Coordinates[] {
  if (waypoints.length < 2 || waypoints.length > MAX_EXACT_WAYPOINTS) {
    return [...waypoints];
  }

  let bestOrder = [...waypoints];
  let bestDistanceKm = chainDistanceKm(start, destination, bestOrder);
  const currentOrder: Coordinates[] = [];
  const used = new Array<boolean>(waypoints.length).fill(false);

  function visit(previous: Coordinates, distanceKm: number): void {
    if (distanceKm >= bestDistanceKm - DISTANCE_EPSILON_KM) {
      return;
    }

    if (currentOrder.length === waypoints.length) {
      const totalKm = distanceKm + haversineKm(previous, destination);
      if (totalKm < bestDistanceKm - DISTANCE_EPSILON_KM) {
        bestDistanceKm = totalKm;
        bestOrder = [...currentOrder];
      }
      return;
    }

    for (let index = 0; index < waypoints.length; index += 1) {
      if (used[index]) {
        continue;
      }
      const waypoint = waypoints[index];
      if (!waypoint) {
        continue;
      }
      used[index] = true;
      currentOrder.push(waypoint);
      visit(waypoint, distanceKm + haversineKm(previous, waypoint));
      currentOrder.pop();
      used[index] = false;
    }
  }

  visit(start, 0);
  return bestOrder;
}

function chainDistanceKm(
  start: Coordinates,
  destination: Coordinates,
  waypoints: Coordinates[],
): number {
  let distanceKm = 0;
  let previous = start;
  for (const waypoint of waypoints) {
    distanceKm += haversineKm(previous, waypoint);
    previous = waypoint;
  }
  return distanceKm + haversineKm(previous, destination);
}
