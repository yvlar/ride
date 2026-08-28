import type { LocationPermissionError } from "@/domain/location/types";
import type { LocationFix } from "@/domain/navigation/types";
import {
  RECORDING_LOCATION_DISABLED_MESSAGE,
  RECORDING_NO_SIGNAL_MESSAGE,
  RECORDING_PERMISSION_DENIED_MESSAGE,
} from "./copy";
import type { RecordedTrackPoint, RecordingError } from "./types";

/**
 * FR-041 — adapte le flux de localisation partagé (FR-023, NFR-006) au point
 * enregistré. L'acquisition GPS reste dans `LocationWatch` : l'enregistrement
 * n'ouvre jamais son propre `watchPosition`.
 */
export function recordedPointFromFix(fix: LocationFix): RecordedTrackPoint {
  return {
    latitude: fix.coordinates.latitude,
    longitude: fix.coordinates.longitude,
    timestamp: fix.recordedAtMs,
    altitude: fix.altitudeMeters ?? null,
    accuracy: Number.isFinite(fix.accuracyMeters) ? fix.accuracyMeters : null,
    speed: fix.speedMetersPerSecond ?? null,
    heading: fix.headingDeg ?? null,
  };
}

/** FR-041 — jamais d'erreur technique brute à l'écran. */
export function recordingErrorFromWatch(
  error: LocationPermissionError,
): RecordingError {
  if (error.code === "PERMISSION_DENIED") {
    return {
      code: "PERMISSION_DENIED",
      message: RECORDING_PERMISSION_DENIED_MESSAGE,
    };
  }
  if (error.code === "UNAVAILABLE") {
    return {
      code: "LOCATION_DISABLED",
      message: RECORDING_LOCATION_DISABLED_MESSAGE,
    };
  }
  return { code: "NO_SIGNAL", message: RECORDING_NO_SIGNAL_MESSAGE };
}
