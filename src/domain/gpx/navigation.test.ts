import { describe, expect, it } from "vitest";
import { offsetCoordinates } from "@/domain/geo/distance";
import { evaluateNavigationProgress } from "@/domain/navigation/progress";
import { composeGpxRoute } from "./compose";
import {
  beginGpxFromFix,
  combinedRemainingKm,
  enterFollowingIfOnTrace,
  gpxStatusLabel,
} from "./navigation";
import type { ParsedGpxTrip } from "./types";
import { FOLLOWING_GPX_MESSAGE, JOINING_GPX_MESSAGE, OFF_GPX_MESSAGE } from "./copy";

const origin = { latitude: 45.4, longitude: -72.7 };

function lineRoute() {
  const east = offsetCoordinates(origin, 90, 3);
  const trip: ParsedGpxTrip = {
    id: "t",
    kind: "track",
    name: "Est",
    parts: [
      {
        points: [{ coordinates: origin }, { coordinates: east }],
      },
    ],
  };
  return composeGpxRoute({ trip, fileName: "est.gpx" });
}

describe("GPX navigation helpers (FR-039)", () => {
  it("labels joining, following and off-route phases", () => {
    expect(gpxStatusLabel("joining_gpx", false)).toBe(JOINING_GPX_MESSAGE);
    expect(gpxStatusLabel("following_gpx", false)).toBe(FOLLOWING_GPX_MESSAGE);
    expect(gpxStatusLabel("following_gpx", true)).toBe(OFF_GPX_MESSAGE);
  });

  it("adds connector remaining to the GPX remaining", () => {
    expect(combinedRemainingKm(0.4, 12)).toBeCloseTo(12.4);
  });

  it("switches from joining to following once the rider is on the trace", () => {
    const original = lineRoute();
    const south = offsetCoordinates(origin, 180, 1);
    const started = beginGpxFromFix(original, {
      coordinates: south,
      accuracyMeters: 8,
      recordedAtMs: 1,
    });
    expect(started.runtime.phase).toBe("joining_gpx");
    const following = enterFollowingIfOnTrace({
      runtime: started.runtime,
      fix: {
        coordinates: origin,
        accuracyMeters: 6,
        recordedAtMs: 2,
      },
    });
    expect(following?.phase).toBe("following_gpx");
    expect(following?.connector).toBeNull();
  });

  it("does not rewind GPX progress on GPS noise behind the rider", () => {
    const original = lineRoute();
    const along = offsetCoordinates(origin, 90, 1.2);
    const evaluated = evaluateNavigationProgress({
      fix: {
        coordinates: along,
        accuracyMeters: 8,
        recordedAtMs: 1,
      },
      geometry: original.geometry,
      steps: original.steps ?? [],
      totalDistanceKm: original.distanceKm,
      totalDurationMinutes: original.durationMinutes,
      previousProgressKm: 1.2,
    });
    const noisy = offsetCoordinates(origin, 90, 1.18);
    const next = evaluateNavigationProgress({
      fix: {
        coordinates: noisy,
        accuracyMeters: 12,
        recordedAtMs: 2,
      },
      geometry: original.geometry,
      steps: original.steps ?? [],
      totalDistanceKm: original.distanceKm,
      totalDurationMinutes: original.durationMinutes,
      previousProgressKm: evaluated?.projection.progressKm ?? 1.2,
    });
    expect(next?.projection.progressKm).toBeGreaterThanOrEqual(
      evaluated?.projection.progressKm ?? 0,
    );
  });

  it("debug repro FR-039 successive enterFollowingIfOnTrace while following_gpx", () => {
    const original = lineRoute();
    const started = beginGpxFromFix(original, {
      coordinates: origin,
      accuracyMeters: 5,
      recordedAtMs: 1,
    });
    expect(started.runtime.phase).toBe("following_gpx");
    const mid = offsetCoordinates(origin, 90, 1.2);
    const second = enterFollowingIfOnTrace({
      runtime: { ...started.runtime, progressKm: 1.2 },
      fix: {
        coordinates: mid,
        accuracyMeters: 6,
        headingDeg: 90,
        recordedAtMs: 2,
      },
    });
    const further = offsetCoordinates(origin, 90, 2);
    const third = enterFollowingIfOnTrace({
      runtime: second ?? { ...started.runtime, progressKm: 1.2 },
      fix: {
        coordinates: further,
        accuracyMeters: 6,
        headingDeg: 90,
        recordedAtMs: 3,
      },
    });
    expect(started.runtime.followRoute.distanceKm).toBeGreaterThan(0);
    expect(second === null || second.phase === "following_gpx").toBe(true);
    expect(third === null || third.phase === "following_gpx").toBe(true);
  });

  it("debug repro FR-039 figure-eight re-enter without previousProgressKm", () => {
    const north = offsetCoordinates(origin, 0, 0.4);
    const east = offsetCoordinates(origin, 90, 0.4);
    const south = offsetCoordinates(origin, 180, 0.4);
    const west = offsetCoordinates(origin, 270, 0.4);
    const trip: ParsedGpxTrip = {
      id: "eight",
      kind: "track",
      name: "Huit",
      parts: [
        {
          points: [north, east, south, west, north, west, south, east, north].map(
            (coordinates) => ({ coordinates }),
          ),
        },
      ],
    };
    const original = composeGpxRoute({ trip, fileName: "huit.gpx" });
    const started = beginGpxFromFix(original, {
      coordinates: offsetCoordinates(north, 90, 0.05),
      accuracyMeters: 5,
      headingDeg: 90,
      recordedAtMs: 1,
    });
    const atCrossing = enterFollowingIfOnTrace({
      runtime: {
        ...started.runtime,
        phase: "following_gpx",
        progressKm: 0.8,
      },
      fix: {
        coordinates: origin,
        accuracyMeters: 5,
        headingDeg: 180,
        recordedAtMs: 2,
      },
    });
    expect(started.runtime.followRoute.distanceKm).toBeGreaterThan(0);
    expect(atCrossing === null || atCrossing.phase === "following_gpx").toBe(true);
  });
});
