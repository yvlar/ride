import { describe, expect, it } from "vitest";
import type { LocationFix } from "@/domain/navigation/types";
import { recordedPointFromFix, recordingErrorFromWatch } from "./acquisition";

const fix: LocationFix = {
  coordinates: { latitude: 45.4, longitude: -72.73 },
  accuracyMeters: 7.5,
  headingDeg: 182,
  speedMetersPerSecond: 24,
  altitudeMeters: 128.4,
  recordedAtMs: 1_700_000_000_000,
};

describe("recordedPointFromFix (FR-041)", () => {
  it("keeps coordinates, timestamp, altitude, accuracy, speed and heading", () => {
    expect(recordedPointFromFix(fix)).toEqual({
      latitude: 45.4,
      longitude: -72.73,
      timestamp: 1_700_000_000_000,
      altitude: 128.4,
      accuracy: 7.5,
      speed: 24,
      heading: 182,
    });
  });

  it("reports a missing altitude as null rather than inventing one", () => {
    const point = recordedPointFromFix({ ...fix, altitudeMeters: undefined });
    expect(point.altitude).toBeNull();
  });

  it("reports an unusable accuracy as null", () => {
    const point = recordedPointFromFix({ ...fix, accuracyMeters: Number.NaN });
    expect(point.accuracy).toBeNull();
  });
});

describe("recordingErrorFromWatch (FR-041)", () => {
  it("maps every watch failure to a readable message", () => {
    expect(
      recordingErrorFromWatch({ code: "PERMISSION_DENIED", message: "raw" }).code,
    ).toBe("PERMISSION_DENIED");
    expect(recordingErrorFromWatch({ code: "UNAVAILABLE", message: "raw" }).code).toBe(
      "LOCATION_DISABLED",
    );
    expect(recordingErrorFromWatch({ code: "TIMEOUT", message: "raw" }).code).toBe(
      "NO_SIGNAL",
    );
    expect(
      recordingErrorFromWatch({ code: "POSITION_UNAVAILABLE", message: "raw" }).code,
    ).toBe("NO_SIGNAL");
  });

  it("never surfaces the raw technical message", () => {
    const error = recordingErrorFromWatch({ code: "TIMEOUT", message: "kCLError 2" });
    expect(error.message).not.toContain("kCLError");
    expect(error.message.length).toBeGreaterThan(20);
  });
});
