import { describe, expect, it } from "vitest";
import {
  coordinatesToPosition,
  lineStringLengthKm,
  offsetCoordinates,
} from "@/domain/geo/distance";
import { composeGpxRoute } from "./compose";
import {
  findGpxEntryPoint,
  insertProjectedVertex,
  isCloseEnoughToGpx,
  remainingNavigableGeometry,
  selectGpxRejoinPoint,
  sliceGpxFromEntry,
  startGpxFromFix,
} from "./follow";
import { parseGpxDocument } from "./parse";
import type { GeneratedGpxRoute, ParsedGpxTrip } from "./types";

const origin = { latitude: 45.4, longitude: -72.7 };

function tripFromPoints(
  points: { latitude: number; longitude: number }[][],
  kind: ParsedGpxTrip["kind"] = "track",
): ParsedGpxTrip {
  return {
    id: "t1",
    kind,
    name: "Trace test",
    parts: points.map((part) => ({
      points: part.map((coordinates) => ({ coordinates })),
    })),
  };
}

function routeFromPoints(
  points: { latitude: number; longitude: number }[],
  extra?: Partial<GeneratedGpxRoute>,
): GeneratedGpxRoute {
  return {
    ...composeGpxRoute({
      trip: tripFromPoints([points]),
      fileName: "test.gpx",
    }),
    ...extra,
  };
}

describe("GPX follow geometry (FR-039, BR-010)", () => {
  it("inserts a projected vertex between GPX points", () => {
    const east = offsetCoordinates(origin, 90, 2);
    const geometry = {
      type: "LineString" as const,
      coordinates: [coordinatesToPosition(origin), coordinatesToPosition(east)],
    };
    const mid = offsetCoordinates(origin, 90, 1);
    const inserted = insertProjectedVertex(geometry, {
      segmentIndex: 0,
      t: 0.5,
      point: mid,
    });
    expect(inserted.geometry.coordinates).toHaveLength(3);
    expect(inserted.vertexIndex).toBe(1);
  });

  it("finds entries near the start, middle and end of an open trace", () => {
    const a = origin;
    const b = offsetCoordinates(origin, 90, 3);
    const c = offsetCoordinates(b, 90, 3);
    const geometry = {
      type: "LineString" as const,
      coordinates: [
        coordinatesToPosition(a),
        coordinatesToPosition(b),
        coordinatesToPosition(c),
      ],
    };
    const start = findGpxEntryPoint({ point: a, geometry });
    const middle = findGpxEntryPoint({
      point: offsetCoordinates(origin, 90, 3),
      geometry,
    });
    const end = findGpxEntryPoint({ point: c, geometry });
    expect(start?.progressKm).toBeCloseTo(0, 2);
    expect(middle?.progressKm).toBeGreaterThan(2);
    expect(end?.progressKm).toBeGreaterThan(middle?.progressKm ?? 0);
  });

  it("never reverses an open GPX: remaining path ends at the last point", () => {
    const a = origin;
    const b = offsetCoordinates(origin, 90, 2);
    const c = offsetCoordinates(b, 90, 2);
    const route = routeFromPoints([a, b, c]);
    const entry = findGpxEntryPoint({
      point: offsetCoordinates(origin, 90, 2),
      geometry: route.originalGeometry,
    });
    expect(entry).not.toBeNull();
    const follow = sliceGpxFromEntry({ route, entry: entry! });
    const last = follow.geometry.coordinates[follow.geometry.coordinates.length - 1]!;
    expect(last[0]).toBeCloseTo(c.longitude, 5);
    expect(last[1]).toBeCloseTo(c.latitude, 5);
    expect(follow.isClosedLoop).toBe(false);
  });

  it("unwraps a closed loop from the entry without reversing", () => {
    const a = origin;
    const b = offsetCoordinates(origin, 90, 1);
    const c = offsetCoordinates(b, 0, 1);
    const d = offsetCoordinates(origin, 0, 1);
    const route = routeFromPoints([a, b, c, d, a]);
    expect(route.isClosedLoop).toBe(true);
    const entry = findGpxEntryPoint({
      point: offsetCoordinates(origin, 90, 0.5),
      geometry: route.originalGeometry,
    });
    const follow = sliceGpxFromEntry({ route, entry: entry! });
    expect(follow.isClosedLoop).toBe(false);
    expect(follow.gapBeforeVertex).toEqual([]);
    expect(follow.distanceKm).toBeGreaterThan(route.distanceKm * 0.8);
    const start = follow.geometry.coordinates[0]!;
    const end = follow.geometry.coordinates[follow.geometry.coordinates.length - 1]!;
    expect(start[0]).toBeCloseTo(end[0], 4);
    expect(start[1]).toBeCloseTo(end[1], 4);
  });

  it("does not draw a straight line across trkseg gaps", () => {
    const parsed = parseGpxDocument(
      `<?xml version="1.0"?><gpx version="1.1">
        <trk><trkseg>
          <trkpt lat="45.40" lon="-72.73"/>
          <trkpt lat="45.401" lon="-72.72"/>
        </trkseg><trkseg>
          <trkpt lat="46.10" lon="-74.50"/>
          <trkpt lat="46.11" lon="-74.49"/>
        </trkseg></trk>
      </gpx>`,
      "gaps.gpx",
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const route = composeGpxRoute({ trip: parsed.trips[0]!, fileName: "gaps.gpx" });
    expect(route.parts).toHaveLength(2);
    expect(route.gapBeforeVertex.length).toBeGreaterThan(0);
    const withGap = lineStringLengthKm(route.geometry);
    expect(route.distanceKm).toBeLessThan(withGap);
  });

  it("starts following immediately when already on the trace", () => {
    const east = offsetCoordinates(origin, 90, 2);
    const route = routeFromPoints([origin, east]);
    const started = startGpxFromFix({
      original: route,
      fix: {
        coordinates: origin,
        accuracyMeters: 8,
        recordedAtMs: 1,
      },
    });
    expect(started.joinTo).toBeNull();
    expect(started.runtime.phase).toBe("following_gpx");
  });

  it("requests a join when the rider is far from the GPX", () => {
    const east = offsetCoordinates(origin, 90, 2);
    const route = routeFromPoints([origin, east]);
    const south = offsetCoordinates(origin, 180, 2);
    const started = startGpxFromFix({
      original: route,
      fix: {
        coordinates: south,
        accuracyMeters: 8,
        recordedAtMs: 1,
      },
    });
    expect(started.runtime.phase).toBe("joining_gpx");
    expect(started.joinTo).not.toBeNull();
    expect(isCloseEnoughToGpx(started.runtime.entry?.distanceM ?? 0, 8)).toBe(
      false,
    );
  });

  it("picks a rejoin point ahead on the remaining GPX", () => {
    const a = origin;
    const b = offsetCoordinates(origin, 90, 5);
    const c = offsetCoordinates(b, 90, 5);
    const route = routeFromPoints([a, b, c]);
    const remaining = remainingNavigableGeometry(
      route.geometry,
      route.gapBeforeVertex,
      1,
    );
    const rejoin = selectGpxRejoinPoint({
      geometry: remaining.geometry,
      gapBeforeVertex: remaining.gapBeforeVertex,
      progressKm: 0,
    });
    expect(rejoin).not.toBeNull();
    const entry = findGpxEntryPoint({
      point: rejoin!,
      geometry: remaining.geometry,
      gapBeforeVertex: remaining.gapBeforeVertex,
    });
    expect(entry?.progressKm).toBeGreaterThan(0.3);
  });

  it("keeps GPX order on a self-crossing figure-eight", () => {
    const n = offsetCoordinates(origin, 0, 0.4);
    const e = offsetCoordinates(origin, 90, 0.4);
    const s = offsetCoordinates(origin, 180, 0.4);
    const w = offsetCoordinates(origin, 270, 0.4);
    const route = routeFromPoints([n, e, s, w, n, w, s, e, n]);
    const started = startGpxFromFix({
      original: route,
      fix: {
        coordinates: offsetCoordinates(n, 90, 0.05),
        accuracyMeters: 5,
        headingDeg: 90,
        recordedAtMs: 1,
      },
    });
    const follow = started.runtime.followRoute.geometry.coordinates;
    expect(follow.length).toBeGreaterThan(3);
    expect(started.runtime.followRoute.isClosedLoop).toBe(false);
  });
});
