import { describe, expect, it } from "vitest";
import { offsetCoordinates } from "@/domain/geo/distance";
import {
  IDLE_TRACK_RECORDING,
  canExportRecording,
  isCollectingFixes,
  recordingReducer,
  type RecordingAction,
} from "./state";
import type { RecordedTrackPoint, TrackRecording } from "./types";

const START_MS = 1_700_000_000_000;

function pointAt(index: number, meters = 40): RecordedTrackPoint {
  const moved = offsetCoordinates(
    { latitude: 45.4, longitude: -72.73 },
    90,
    (meters * index) / 1_000,
  );
  return {
    latitude: moved.latitude,
    longitude: moved.longitude,
    timestamp: START_MS + index * 2_000,
    accuracy: 6,
    altitude: 120 + index,
  };
}

function run(actions: RecordingAction[], from = IDLE_TRACK_RECORDING): TrackRecording {
  return actions.reduce(recordingReducer, from);
}

const recordingWithTwoPoints = run([
  { type: "start", atMs: START_MS },
  { type: "fix", point: pointAt(0) },
  { type: "fix", point: pointAt(1) },
]);

describe("recordingReducer (FR-041)", () => {
  it("starts by requesting the permission before any fix", () => {
    const state = recordingReducer(IDLE_TRACK_RECORDING, {
      type: "start",
      atMs: START_MS,
    });
    expect(state.status).toBe("requesting-permission");
    expect(state.startedAtMs).toBe(START_MS);
    expect(state.points).toEqual([]);
    expect(isCollectingFixes(state)).toBe(true);
  });

  it("switches to recording on the first accepted fix", () => {
    const state = run([
      { type: "start", atMs: START_MS },
      { type: "fix", point: pointAt(0) },
    ]);
    expect(state.status).toBe("recording");
    expect(state.points).toHaveLength(1);
    expect(state.distanceKm).toBe(0);
  });

  it("accumulates distance from accepted fixes", () => {
    expect(recordingWithTwoPoints.points).toHaveLength(2);
    expect(recordingWithTwoPoints.distanceKm).toBeCloseTo(0.04, 3);
  });

  it("drops filtered fixes without touching the trace", () => {
    const state = run(
      [
        { type: "fix", point: { ...pointAt(1), latitude: 999 } },
        { type: "fix", point: pointAt(1) },
      ],
      run([{ type: "start", atMs: START_MS }, { type: "fix", point: pointAt(0) }]),
    );
    expect(state.points).toHaveLength(2);
  });

  it("refuses a second recording while one is running", () => {
    const state = recordingReducer(recordingWithTwoPoints, {
      type: "start",
      atMs: START_MS + 60_000,
    });
    expect(state).toBe(recordingWithTwoPoints);
    expect(state.points).toHaveLength(2);
  });

  it("refuses to restart over a preview that was never exported", () => {
    const preview = recordingReducer(recordingWithTwoPoints, {
      type: "stop",
      atMs: START_MS + 4_000,
    });
    expect(preview.status).toBe("preview");
    expect(
      recordingReducer(preview, { type: "start", atMs: START_MS + 5_000 }),
    ).toBe(preview);
  });

  it("stops the permission request on a denied permission", () => {
    const state = run([
      { type: "start", atMs: START_MS },
      {
        type: "location-error",
        error: { code: "PERMISSION_DENIED", message: "refusé" },
      },
    ]);
    expect(state.status).toBe("error");
    expect(state.error?.code).toBe("PERMISSION_DENIED");
    expect(state.points).toEqual([]);
  });

  it("keeps recording when the signal drops mid-ride", () => {
    const state = recordingReducer(recordingWithTwoPoints, {
      type: "location-error",
      error: { code: "NO_SIGNAL", message: "aucun signal" },
    });
    expect(state.status).toBe("recording");
    expect(state.points).toHaveLength(2);
    expect(state.error?.code).toBe("NO_SIGNAL");
  });

  it("clears the warning on the next accepted fix", () => {
    const warned = recordingReducer(recordingWithTwoPoints, {
      type: "location-error",
      error: { code: "NO_SIGNAL", message: "aucun signal" },
    });
    const state = recordingReducer(warned, { type: "fix", point: pointAt(2) });
    expect(state.error).toBeNull();
  });

  it("moves to preview on stop and keeps the points", () => {
    const state = recordingReducer(recordingWithTwoPoints, {
      type: "stop",
      atMs: START_MS + 4_000,
    });
    expect(state.status).toBe("preview");
    expect(state.stoppedAtMs).toBe(START_MS + 4_000);
    expect(state.points).toHaveLength(2);
    expect(isCollectingFixes(state)).toBe(false);
  });

  it("reports a track that is too short instead of losing it", () => {
    const state = run([
      { type: "start", atMs: START_MS },
      { type: "fix", point: pointAt(0) },
      { type: "stop", atMs: START_MS + 1_000 },
    ]);
    expect(state.status).toBe("error");
    expect(state.error?.code).toBe("NOT_ENOUGH_POINTS");
    expect(state.points).toHaveLength(1);
    expect(canExportRecording(state)).toBe(false);
  });

  it("returns to idle when the rider stops before the first fix", () => {
    const state = run([
      { type: "start", atMs: START_MS },
      { type: "stop", atMs: START_MS + 1_000 },
    ]);
    expect(state).toEqual(IDLE_TRACK_RECORDING);
  });

  it("ignores fixes once the recording stopped", () => {
    const preview = recordingReducer(recordingWithTwoPoints, {
      type: "stop",
      atMs: START_MS + 4_000,
    });
    expect(recordingReducer(preview, { type: "fix", point: pointAt(2) })).toBe(preview);
  });

  it("refuses to export a preview with a single point", () => {
    const shortStop = run([
      { type: "start", atMs: START_MS },
      { type: "fix", point: pointAt(0) },
      { type: "stop", atMs: START_MS + 1_000 },
    ]);
    expect(recordingReducer(shortStop, { type: "export-started" })).toBe(shortStop);
  });

  it("records the exported file name on success", () => {
    const state = run(
      [
        { type: "export-started" },
        { type: "export-succeeded", fileName: "ride-2026-08-25-1430.gpx" },
      ],
      recordingReducer(recordingWithTwoPoints, { type: "stop", atMs: START_MS + 4_000 }),
    );
    expect(state.status).toBe("preview");
    expect(state.exportedFileName).toBe("ride-2026-08-25-1430.gpx");
    expect(state.error).toBeNull();
  });

  it("keeps the track when the export fails", () => {
    const state = run(
      [{ type: "export-started" }, { type: "export-failed" }],
      recordingReducer(recordingWithTwoPoints, { type: "stop", atMs: START_MS + 4_000 }),
    );
    expect(state.status).toBe("preview");
    expect(state.error?.code).toBe("EXPORT_FAILED");
    expect(state.points).toHaveLength(2);
  });

  it("returns to the preview without an error when the share is cancelled", () => {
    const state = run(
      [{ type: "export-started" }, { type: "export-cancelled" }],
      recordingReducer(recordingWithTwoPoints, { type: "stop", atMs: START_MS + 4_000 }),
    );
    expect(state.status).toBe("preview");
    expect(state.error).toBeNull();
    expect(state.exportedFileName).toBeNull();
  });

  it("returns to the initial state on discard", () => {
    expect(recordingReducer(recordingWithTwoPoints, { type: "discard" })).toEqual(
      IDLE_TRACK_RECORDING,
    );
  });
});
