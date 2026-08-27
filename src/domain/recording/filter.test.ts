import { describe, expect, it } from "vitest";
import { offsetCoordinates } from "@/domain/geo/distance";
import {
  RECORDING_FIRST_FIX_MAX_ACCURACY_M,
  RECORDING_JUMP_RESYNC_FIXES,
  RECORDING_MAX_ACCURACY_M,
} from "./constants";
import {
  evaluateRecordedPoint,
  isValidRecordedPoint,
  recordedDistanceKm,
} from "./filter";
import type { RecordedTrackPoint } from "./types";

const base: RecordedTrackPoint = {
  latitude: 45.4,
  longitude: -72.73,
  timestamp: 1_700_000_000_000,
  accuracy: 8,
};

function movedBy(
  previous: RecordedTrackPoint,
  meters: number,
  elapsedMs: number,
  bearingDeg = 90,
): RecordedTrackPoint {
  const next = offsetCoordinates(
    { latitude: previous.latitude, longitude: previous.longitude },
    bearingDeg,
    meters / 1_000,
  );
  return {
    latitude: next.latitude,
    longitude: next.longitude,
    timestamp: previous.timestamp + elapsedMs,
    accuracy: 8,
  };
}

describe("isValidRecordedPoint (FR-041)", () => {
  it("rejects non finite and out of range coordinates", () => {
    expect(isValidRecordedPoint({ ...base, latitude: Number.NaN })).toBe(false);
    expect(isValidRecordedPoint({ ...base, longitude: Number.POSITIVE_INFINITY })).toBe(
      false,
    );
    expect(isValidRecordedPoint({ ...base, latitude: 91 })).toBe(false);
    expect(isValidRecordedPoint({ ...base, longitude: -181 })).toBe(false);
  });

  it("rejects a missing timestamp and Null Island", () => {
    expect(isValidRecordedPoint({ ...base, timestamp: 0 })).toBe(false);
    expect(isValidRecordedPoint({ latitude: 0, longitude: 0, timestamp: 1 })).toBe(
      false,
    );
  });

  it("accepts a plain valid fix", () => {
    expect(isValidRecordedPoint(base)).toBe(true);
  });
});

describe("evaluateRecordedPoint (FR-041)", () => {
  it("accepts the first precise fix without adding distance", () => {
    const decision = evaluateRecordedPoint({ candidate: base, previous: null });
    expect(decision).toEqual({ accepted: true, addedKm: 0, resynchronized: false });
  });

  it("ignores an extremely imprecise first fix", () => {
    const decision = evaluateRecordedPoint({
      candidate: { ...base, accuracy: RECORDING_FIRST_FIX_MAX_ACCURACY_M + 1 },
      previous: null,
    });
    expect(decision).toEqual({ accepted: false, reason: "low-accuracy" });
  });

  it("keeps a first fix whose accuracy is unknown", () => {
    const decision = evaluateRecordedPoint({
      candidate: { ...base, accuracy: null },
      previous: null,
    });
    expect(decision.accepted).toBe(true);
  });

  it("ignores an imprecise fix while recording", () => {
    const candidate = movedBy(base, 40, 2_000);
    const decision = evaluateRecordedPoint({
      candidate: { ...candidate, accuracy: RECORDING_MAX_ACCURACY_M + 5 },
      previous: base,
    });
    expect(decision).toEqual({ accepted: false, reason: "low-accuracy" });
  });

  it("ignores an invalid candidate", () => {
    const decision = evaluateRecordedPoint({
      candidate: { ...base, latitude: 120 },
      previous: base,
    });
    expect(decision).toEqual({ accepted: false, reason: "invalid-coordinates" });
  });

  it("ignores duplicated and out of order timestamps", () => {
    expect(
      evaluateRecordedPoint({ candidate: { ...base }, previous: base }),
    ).toEqual({ accepted: false, reason: "duplicate" });
    expect(
      evaluateRecordedPoint({
        candidate: { ...movedBy(base, 50, -5_000) },
        previous: base,
      }),
    ).toEqual({ accepted: false, reason: "duplicate" });
  });

  it("ignores standstill jitter", () => {
    const decision = evaluateRecordedPoint({
      candidate: movedBy(base, 2, 3_000),
      previous: base,
    });
    expect(decision).toEqual({ accepted: false, reason: "stationary" });
  });

  it("keeps a real move above the standstill threshold", () => {
    const decision = evaluateRecordedPoint({
      candidate: movedBy(base, 25, 2_000),
      previous: base,
    });
    expect(decision.accepted).toBe(true);
    if (decision.accepted) {
      expect(decision.addedKm).toBeCloseTo(0.025, 3);
    }
  });

  it("keeps a genuine change of direction", () => {
    const north = movedBy(base, 30, 2_000, 0);
    const east = movedBy(north, 30, 2_000, 90);
    expect(evaluateRecordedPoint({ candidate: north, previous: base }).accepted).toBe(
      true,
    );
    expect(evaluateRecordedPoint({ candidate: east, previous: north }).accepted).toBe(
      true,
    );
  });

  it("rejects an impossible jump", () => {
    const decision = evaluateRecordedPoint({
      candidate: movedBy(base, 5_000, 1_000),
      previous: base,
    });
    expect(decision).toEqual({ accepted: false, reason: "impossible-jump" });
  });

  it("resynchronizes once the jump persists", () => {
    const candidate = movedBy(base, 5_000, 1_000);
    const decision = evaluateRecordedPoint({
      candidate,
      previous: base,
      rejectedJumps: RECORDING_JUMP_RESYNC_FIXES - 1,
    });
    expect(decision.accepted).toBe(true);
    if (decision.accepted) {
      expect(decision.resynchronized).toBe(true);
    }
  });
});

describe("recordedDistanceKm (FR-041)", () => {
  it("sums the great-circle distance between kept points", () => {
    const second = movedBy(base, 100, 5_000);
    const third = movedBy(second, 150, 5_000);
    expect(recordedDistanceKm([base, second, third])).toBeCloseTo(0.25, 3);
  });

  it("is zero below two points", () => {
    expect(recordedDistanceKm([])).toBe(0);
    expect(recordedDistanceKm([base])).toBe(0);
  });
});
