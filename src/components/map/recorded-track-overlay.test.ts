import { describe, expect, it } from "vitest";
import type { RecordedTrackPoint } from "@/domain/recording/types";
import {
  RECORDED_TRACK_END_LABEL,
  RECORDED_TRACK_START_LABEL,
  recordedTrackOverlay,
} from "./recorded-track-overlay";

const points: RecordedTrackPoint[] = [
  { latitude: 45.4, longitude: -72.73, timestamp: 1 },
  { latitude: 45.41, longitude: -72.72, timestamp: 2 },
  { latitude: 45.42, longitude: -72.71, timestamp: 3 },
];

describe("recordedTrackOverlay (FR-041)", () => {
  it("has nothing to draw without a point", () => {
    expect(recordedTrackOverlay([])).toBeNull();
  });

  it("builds the line in GeoJSON order while recording", () => {
    const overlay = recordedTrackOverlay(points);
    expect(overlay?.geometry.coordinates).toEqual([
      [-72.73, 45.4],
      [-72.72, 45.41],
      [-72.71, 45.42],
    ]);
  });

  it("grows with the trace as points arrive", () => {
    expect(recordedTrackOverlay(points.slice(0, 2))?.geometry.coordinates).toHaveLength(
      2,
    );
    expect(recordedTrackOverlay(points)?.geometry.coordinates).toHaveLength(3);
  });

  it("shows only the start marker while recording, and never refits the camera", () => {
    const overlay = recordedTrackOverlay(points);
    expect(overlay?.startPoint).toEqual({ latitude: 45.4, longitude: -72.73 });
    expect(overlay?.endPoint).toBeNull();
    expect(overlay?.fitBounds).toBe(false);
  });

  it("adds a distinct arrival marker and refits once stopped", () => {
    const overlay = recordedTrackOverlay(points, { completed: true });
    expect(overlay?.startPoint).toEqual({ latitude: 45.4, longitude: -72.73 });
    expect(overlay?.endPoint).toEqual({ latitude: 45.42, longitude: -72.71 });
    expect(overlay?.fitBounds).toBe(true);
    expect(RECORDED_TRACK_START_LABEL).not.toBe(RECORDED_TRACK_END_LABEL);
  });

  it("frames the whole track", () => {
    const overlay = recordedTrackOverlay(points, { completed: true });
    expect(overlay?.bounds).toEqual({
      west: -72.73,
      south: 45.4,
      east: -72.71,
      north: 45.42,
    });
  });

  it("keeps a single-point track without an arrival marker", () => {
    const overlay = recordedTrackOverlay(points.slice(0, 1), { completed: true });
    expect(overlay?.startPoint).not.toBeNull();
    expect(overlay?.endPoint).toBeNull();
  });
});
