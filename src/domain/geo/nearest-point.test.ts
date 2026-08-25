import { describe, expect, it } from "vitest";
import { offsetCoordinates } from "@/domain/geo/distance";
import { closestPointOnSegment, nearestPointOnLine } from "@/domain/geo/nearest-point";
import type { LineString } from "@/domain/geo/types";

const origin = { latitude: 45.4, longitude: -72.7 };

describe("nearestPointOnLine (FR-039)", () => {
  it("projects onto the middle of a segment, not only vertices", () => {
    const east = offsetCoordinates(origin, 90, 2);
    const geometry: LineString = {
      type: "LineString",
      coordinates: [
        [origin.longitude, origin.latitude],
        [east.longitude, east.latitude],
      ],
    };
    const mid = offsetCoordinates(origin, 90, 1);
    const northOfMid = offsetCoordinates(mid, 0, 0.05);
    const nearest = nearestPointOnLine(northOfMid, geometry);
    expect(nearest).not.toBeNull();
    expect(nearest!.t).toBeGreaterThan(0.4);
    expect(nearest!.t).toBeLessThan(0.6);
    expect(nearest!.segmentIndex).toBe(0);
    expect(nearest!.point.latitude).toBeCloseTo(mid.latitude, 3);
    expect(nearest!.point.longitude).toBeCloseTo(mid.longitude, 3);
  });

  it("returns the point itself when already on the polyline", () => {
    const east = offsetCoordinates(origin, 90, 1);
    const geometry: LineString = {
      type: "LineString",
      coordinates: [
        [origin.longitude, origin.latitude],
        [east.longitude, east.latitude],
      ],
    };
    const nearest = nearestPointOnLine(east, geometry);
    expect(nearest!.distanceM).toBeLessThan(1);
    expect(nearest!.t).toBeCloseTo(1, 2);
  });

  it("skips gap segments so non-contiguous parts are not joined", () => {
    const a = origin;
    const b = offsetCoordinates(origin, 90, 1);
    const c = offsetCoordinates(origin, 0, 20);
    const d = offsetCoordinates(c, 90, 1);
    const geometry: LineString = {
      type: "LineString",
      coordinates: [
        [a.longitude, a.latitude],
        [b.longitude, b.latitude],
        [c.longitude, c.latitude],
        [d.longitude, d.latitude],
      ],
    };
    const between = {
      latitude: (b.latitude + c.latitude) / 2,
      longitude: (b.longitude + c.longitude) / 2,
    };
    const nearest = nearestPointOnLine(between, geometry, {
      gapBeforeVertex: new Set([2]),
    });
    expect(nearest).not.toBeNull();
    const closest = closestPointOnSegment(between, b, c);
    expect(nearest!.distanceM).toBeGreaterThan(closest.distanceKm * 1_000 * 0.5);
  });

  it("breaks near-ties with heading then GPX order", () => {
    const east = offsetCoordinates(origin, 90, 1);
    const north = offsetCoordinates(origin, 0, 1);
    const geometry: LineString = {
      type: "LineString",
      coordinates: [
        [origin.longitude, origin.latitude],
        [east.longitude, east.latitude],
        [origin.longitude, origin.latitude],
        [north.longitude, north.latitude],
      ],
    };
    const nearOrigin = offsetCoordinates(origin, 45, 0.002);
    const nearest = nearestPointOnLine(nearOrigin, geometry, {
      headingDeg: 0,
      tieDistanceM: 80,
    });
    expect(nearest).not.toBeNull();
    expect(nearest!.segmentIndex).toBeGreaterThanOrEqual(2);
  });
});
