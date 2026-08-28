import type { Coordinates } from "@/domain/geo/types";

/** FR-041 — relevé GPS conservé dans un parcours enregistré. */
export type RecordedTrackPoint = {
  latitude: number;
  longitude: number;
  timestamp: number;
  altitude?: number | null;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
};

/** FR-041 — machine d'état de l'enregistrement. */
export type RecordingStatus =
  | "idle"
  | "requesting-permission"
  | "recording"
  | "preview"
  | "exporting"
  | "error";

export type RecordingErrorCode =
  | "PERMISSION_DENIED"
  | "LOCATION_DISABLED"
  | "NO_SIGNAL"
  | "NOT_ENOUGH_POINTS"
  | "EXPORT_FAILED";

export type RecordingError = {
  code: RecordingErrorCode;
  message: string;
};

export type TrackRecording = {
  status: RecordingStatus;
  points: RecordedTrackPoint[];
  distanceKm: number;
  /** Instant du geste « Démarrer », pas du premier relevé accepté. */
  startedAtMs: number | null;
  stoppedAtMs: number | null;
  lastFixAtMs: number | null;
  /** Sauts consécutifs rejetés, pour la resynchronisation (FR-041). */
  rejectedJumps: number;
  error: RecordingError | null;
  exportedFileName: string | null;
};

export function recordedPointCoordinates(
  point: RecordedTrackPoint,
): Coordinates {
  return { latitude: point.latitude, longitude: point.longitude };
}
