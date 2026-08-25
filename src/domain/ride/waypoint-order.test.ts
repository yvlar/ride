import { describe, expect, it } from "vitest";
import { offsetCoordinates } from "@/domain/geo/distance";
import {
  describedLoopWaypointOrders,
  orderLoopWaypoints,
  orderOneWayWaypoints,
} from "./waypoint-order";

const GRANBY = { latitude: 45.403, longitude: -72.734 };

describe("AI waypoint ordering (FR-034)", () => {
  it("removes a crossing from an unordered loop plan", () => {
    const north = offsetCoordinates(GRANBY, 0, 20);
    const south = offsetCoordinates(GRANBY, 180, 20);
    const east = offsetCoordinates(GRANBY, 90, 20);
    const west = offsetCoordinates(GRANBY, 270, 20);

    const ordered = orderLoopWaypoints(GRANBY, [north, south, east, west]);

    expect(ordered).not.toEqual([north, south, east, west]);
    expect(ordered).toEqual([north, east, south, west]);
  });

  it("keeps a one-way arrival fixed while ordering its intermediate points", () => {
    const north = offsetCoordinates(GRANBY, 0, 10);
    const south = offsetCoordinates(GRANBY, 180, 30);
    const east = offsetCoordinates(GRANBY, 90, 20);
    const destination = offsetCoordinates(GRANBY, 90, 60);

    expect(
      orderOneWayWaypoints(GRANBY, destination, [east, south, north]),
    ).toEqual([north, south, east]);
  });

  it("does not mutate the model reply", () => {
    const points = [
      offsetCoordinates(GRANBY, 0, 10),
      offsetCoordinates(GRANBY, 90, 10),
    ];
    const snapshot = [...points];

    orderLoopWaypoints(GRANBY, points);

    expect(points).toEqual(snapshot);
  });

  it("keeps the AI riding order first and reverse second (FR-034)", () => {
    const north = offsetCoordinates(GRANBY, 0, 20);
    const south = offsetCoordinates(GRANBY, 180, 20);
    const east = offsetCoordinates(GRANBY, 90, 20);
    const orders = describedLoopWaypointOrders(GRANBY, [north, south, east]);

    expect(orders[0]).toEqual([north, south, east]);
    expect(orders[1]).toEqual([east, south, north]);
  });
});
