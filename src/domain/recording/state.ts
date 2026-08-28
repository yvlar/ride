import { RECORDING_MIN_EXPORT_POINTS } from "./constants";
import {
  RECORDING_EXPORT_FAILED_MESSAGE,
  RECORDING_NOT_ENOUGH_POINTS_MESSAGE,
} from "./copy";
import { evaluateRecordedPoint, type RecordedPointRejection } from "./filter";
import type {
  RecordedTrackPoint,
  RecordingError,
  TrackRecording,
} from "./types";

export type RecordingAction =
  | { type: "start"; atMs: number }
  | { type: "fix"; point: RecordedTrackPoint }
  | { type: "location-error"; error: RecordingError }
  | { type: "stop"; atMs: number }
  | { type: "export-started" }
  | { type: "export-succeeded"; fileName: string }
  | { type: "export-failed"; message?: string }
  | { type: "export-cancelled" }
  | { type: "discard" };

export const IDLE_TRACK_RECORDING: TrackRecording = {
  status: "idle",
  points: [],
  distanceKm: 0,
  startedAtMs: null,
  stoppedAtMs: null,
  lastFixAtMs: null,
  rejectedJumps: 0,
  error: null,
  exportedFileName: null,
};

/** FR-041 — un enregistrement est en cours tant que le GPS doit être suivi. */
export function isCollectingFixes(state: TrackRecording): boolean {
  return state.status === "requesting-permission" || state.status === "recording";
}

/** FR-041 — un parcours non exporté ne doit jamais disparaître en silence. */
export function hasRecordedTrack(state: TrackRecording): boolean {
  return state.points.length > 0;
}

export function canExportRecording(state: TrackRecording): boolean {
  return state.points.length >= RECORDING_MIN_EXPORT_POINTS;
}

/**
 * FR-041 — réducteur unique de l'enregistrement. Toute transition interdite
 * (double enregistrement, export sans trace, relevé après l'arrêt) renvoie
 * l'état inchangé plutôt que de muter la trace.
 */
export function recordingReducer(
  state: TrackRecording,
  action: RecordingAction,
): TrackRecording {
  switch (action.type) {
    case "start": {
      // Un enregistrement en cours ou un parcours non traité prime : redémarrer
      // effacerait la trace sans confirmation.
      if (state.status !== "idle" && state.status !== "error") {
        return state;
      }
      if (state.status === "error" && hasRecordedTrack(state)) {
        return state;
      }
      return {
        ...IDLE_TRACK_RECORDING,
        status: "requesting-permission",
        startedAtMs: action.atMs,
      };
    }

    case "fix": {
      if (!isCollectingFixes(state)) {
        return state;
      }
      const previous = state.points[state.points.length - 1] ?? null;
      const decision = evaluateRecordedPoint({
        candidate: action.point,
        previous,
        rejectedJumps: state.rejectedJumps,
      });
      if (!decision.accepted) {
        return {
          ...state,
          rejectedJumps: nextRejectedJumps(state.rejectedJumps, decision.reason),
        };
      }
      return {
        ...state,
        status: "recording",
        points: [...state.points, action.point],
        distanceKm: state.distanceKm + decision.addedKm,
        lastFixAtMs: action.point.timestamp,
        rejectedJumps: 0,
        error: null,
      };
    }

    case "location-error": {
      if (state.status === "requesting-permission") {
        return { ...state, status: "error", error: action.error };
      }
      // En cours d'enregistrement, une perte de signal est signalée sans
      // interrompre la collecte : les points déjà acquis sont conservés.
      if (state.status === "recording") {
        return { ...state, error: action.error };
      }
      return state;
    }

    case "stop": {
      if (!isCollectingFixes(state)) {
        return state;
      }
      // Arrêter avant le premier relevé n'a rien enregistré : rien à signaler,
      // rien à perdre, retour à l'état initial.
      if (!hasRecordedTrack(state)) {
        return { ...IDLE_TRACK_RECORDING };
      }
      if (!canExportRecording(state)) {
        return {
          ...state,
          status: "error",
          stoppedAtMs: action.atMs,
          error: {
            code: "NOT_ENOUGH_POINTS",
            message: RECORDING_NOT_ENOUGH_POINTS_MESSAGE,
          },
        };
      }
      return {
        ...state,
        status: "preview",
        stoppedAtMs: action.atMs,
        error: null,
      };
    }

    case "export-started": {
      if (state.status !== "preview" || !canExportRecording(state)) {
        return state;
      }
      return { ...state, status: "exporting", error: null };
    }

    case "export-succeeded": {
      if (state.status !== "exporting") {
        return state;
      }
      return {
        ...state,
        status: "preview",
        error: null,
        exportedFileName: action.fileName,
      };
    }

    case "export-failed": {
      if (state.status !== "exporting") {
        return state;
      }
      // Le parcours reste disponible : l'échec d'export ne le supprime jamais.
      return {
        ...state,
        status: "preview",
        error: {
          code: "EXPORT_FAILED",
          message: action.message ?? RECORDING_EXPORT_FAILED_MESSAGE,
        },
      };
    }

    case "export-cancelled": {
      if (state.status !== "exporting") {
        return state;
      }
      return { ...state, status: "preview", error: null };
    }

    case "discard":
      return { ...IDLE_TRACK_RECORDING };

    default:
      return state;
  }
}

function nextRejectedJumps(
  current: number,
  reason: RecordedPointRejection,
): number {
  return reason === "impossible-jump" ? current + 1 : current;
}
