"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { LocationWatch } from "@/domain/location/types";
import {
  composeRecordedTrackGpx,
  recordedTrackFileName,
  recordedTrackName,
} from "@/domain/gpx/serialize";
import {
  recordedPointFromFix,
  recordingErrorFromWatch,
} from "@/domain/recording/acquisition";
import {
  IDLE_TRACK_RECORDING,
  canExportRecording,
  isCollectingFixes,
  recordingReducer,
} from "@/domain/recording/state";
import type { TrackRecording } from "@/domain/recording/types";
import {
  exportGpxFile,
  type GpxExportOutcome,
  type GpxFilePayload,
} from "@/infrastructure/export/gpx-file-export";
import { recordedTrackOverlay } from "@/components/map/recorded-track-overlay";

export type TrackRecorderDeps = {
  /** Flux de localisation partagé : l'enregistrement n'ouvre jamais le sien (NFR-006). */
  locationWatch: LocationWatch;
  now?: () => number;
  exportFile?: (payload: GpxFilePayload) => Promise<GpxExportOutcome>;
};

export type TrackRecorder = {
  state: TrackRecording;
  overlay: ReturnType<typeof recordedTrackOverlay>;
  canExport: boolean;
  start: () => void;
  stop: () => void;
  save: () => Promise<void>;
  discard: () => void;
};

/**
 * FR-041 — état de l'enregistrement en direct. Le hook orchestre seulement :
 * le filtrage, la machine d'état, la sérialisation GPX et l'export vivent
 * chacun dans leur module.
 */
export function useTrackRecorder(deps: TrackRecorderDeps): TrackRecorder {
  const { locationWatch } = deps;
  const providedNow = deps.now;
  const providedExportFile = deps.exportFile;
  const now = useMemo(
    () => providedNow ?? (() => Date.now()),
    [providedNow],
  );
  const exportFile = useMemo(
    () =>
      providedExportFile ??
      ((payload: GpxFilePayload) => exportGpxFile(payload)),
    [providedExportFile],
  );
  const [state, dispatch] = useReducer(recordingReducer, IDLE_TRACK_RECORDING);
  const stateRef = useRef(state);
  const nowRef = useRef(now);
  const exportFileRef = useRef(exportFile);
  // Empêche un double appui de lancer deux exports de la même trace.
  const exportingRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
    nowRef.current = now;
    exportFileRef.current = exportFile;
  }, [state, now, exportFile]);

  const collecting = isCollectingFixes(state);
  const completed = !collecting;

  useEffect(() => {
    if (!collecting) {
      return;
    }
    const unsubscribe = locationWatch.subscribe((event) => {
      if (!isCollectingFixes(stateRef.current)) {
        return;
      }
      if (event.type === "error") {
        dispatch({ type: "location-error", error: recordingErrorFromWatch(event.error) });
        return;
      }
      dispatch({ type: "fix", point: recordedPointFromFix(event.fix) });
    });
    // L'arrêt et la suppression coupent l'abonnement; le dernier abonné
    // libère le `watchPosition` natif (NFR-006).
    return unsubscribe;
  }, [collecting, locationWatch]);

  const start = useCallback(() => {
    if (stateRef.current.status !== "idle" && stateRef.current.status !== "error") {
      return;
    }
    try {
      // iOS exige l'ouverture du watch dans la pile d'appel du geste (FR-023).
      locationWatch.start();
    } catch {
      // L'abonnement ci-dessus reste la source des relevés et des erreurs.
    }
    dispatch({ type: "start", atMs: nowRef.current() });
  }, [locationWatch]);

  const stop = useCallback(() => {
    dispatch({ type: "stop", atMs: nowRef.current() });
  }, []);

  const discard = useCallback(() => {
    exportingRef.current = false;
    dispatch({ type: "discard" });
  }, []);

  const save = useCallback(async () => {
    const current = stateRef.current;
    if (
      exportingRef.current ||
      current.status !== "preview" ||
      !canExportRecording(current)
    ) {
      return;
    }
    exportingRef.current = true;
    dispatch({ type: "export-started" });
    try {
      const startedAtMs = current.startedAtMs ?? current.points[0]!.timestamp;
      const fileName = recordedTrackFileName(startedAtMs);
      const contents = composeRecordedTrackGpx({
        name: recordedTrackName(startedAtMs),
        points: current.points,
        createdAtMs: current.points[0]!.timestamp,
      });
      const outcome = await exportFileRef.current({ fileName, contents });
      if (outcome === "cancelled") {
        dispatch({ type: "export-cancelled" });
        return;
      }
      dispatch({ type: "export-succeeded", fileName });
    } catch {
      dispatch({ type: "export-failed" });
    } finally {
      exportingRef.current = false;
    }
  }, []);

  const overlay = useMemo(
    () => recordedTrackOverlay(state.points, { completed }),
    [state.points, completed],
  );

  return {
    state,
    overlay,
    canExport: canExportRecording(state),
    start,
    stop,
    save,
    discard,
  };
}
