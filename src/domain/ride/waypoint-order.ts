import { haversineKm } from "@/domain/geo/distance";
import type { Coordinates } from "@/domain/geo/types";

const MAX_EXACT_WAYPOINTS = 8;
const DISTANCE_EPSILON_KM = 0.000_001;

/**
 * Order a small AI-selected waypoint set as the shortest closed chain from
 * the start. Used only as an extra candidate, never as a silent replacement
 * of the model's riding order (FR-034).
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

/**
 * FR-034 — evaluate the AI order, its reverse, and the optional shortest
 * chain. Duplicates are removed while preserving that sequence.
 */
export function describedLoopWaypointOrders(
  start: Coordinates,
  waypoints: Coordinates[],
): Coordinates[][] {
  const orders = [
    [...waypoints],
    [...waypoints].reverse(),
    orderLoopWaypoints(start, waypoints),
  ];
  return uniqueCoordinateOrders(orders);
}

export function describedOneWayWaypointOrders(
  start: Coordinates,
  destination: Coordinates,
  waypoints: Coordinates[],
): Coordinates[][] {
  const inbound = [...waypoints];
  const orders = [
    inbound,
    orderOneWayWaypoints(start, destination, inbound),
  ];
  return uniqueCoordinateOrders(orders);
}

function uniqueCoordinateOrders(orders: Coordinates[][]): Coordinates[][] {
  const unique: Coordinates[][] = [];
  const seen = new Set<string>();
  for (const order of orders) {
    const key = order
      .map((point) => `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`)
      .join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(order);
  }
  return unique;
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
