"use client";

import { useEffect, useState } from "react";
import { Circle, Save, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceLabel } from "@/components/navigation/format-navigation";
import {
  RECORDING_ACQUIRING_LABEL,
  RECORDING_ACTIVE_LABEL,
  RECORDING_DELETE_CONFIRM_LABEL,
  RECORDING_DELETE_CONFIRM_QUESTION,
  RECORDING_DELETE_LABEL,
  RECORDING_DISMISS_LABEL,
  RECORDING_EXPORTING_LABEL,
  RECORDING_EXPORT_LABEL,
  RECORDING_FINISH_LABEL,
  RECORDING_KEEP_LABEL,
  RECORDING_PREVIEW_LABEL,
  RECORDING_START_LABEL,
  RECORDING_STOP_LABEL,
  formatElapsedLabel,
  recordingExportedMessage,
} from "@/domain/recording/copy";
import { cn } from "@/lib/utils";
import type { TrackRecorder } from "./use-track-recorder";

export const RECORDING_TICK_MS = 1_000;

export type TrackRecorderControlProps = {
  recorder: TrackRecorder;
  now?: () => number;
  className?: string;
};

/**
 * FR-041 — commande unique de l'enregistrement. Toujours au bas de l'écran,
 * donc atteignable au pouce, et jamais recouverte par une feuille ou par la
 * navigation.
 */
export function TrackRecorderControl({
  recorder,
  now = () => Date.now(),
  className,
}: TrackRecorderControlProps) {
  const { state } = recorder;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tickMs, setTickMs] = useState(() => now());
  const collecting =
    state.status === "recording" || state.status === "requesting-permission";

  useEffect(() => {
    if (!collecting) {
      return;
    }
    const timer = setInterval(() => setTickMs(Date.now()), RECORDING_TICK_MS);
    return () => clearInterval(timer);
  }, [collecting]);

  // Le tic d'horloge peut précéder le départ; il ne doit jamais afficher une
  // durée négative ni une durée héritée d'un enregistrement précédent.
  const elapsedMs =
    state.startedAtMs === null
      ? 0
      : Math.max(0, (state.stoppedAtMs ?? tickMs) - state.startedAtMs);

  if (state.status === "idle") {
    return (
      <section aria-label="Enregistrement du parcours" className={className}>
        <Button
          type="button"
          variant="outline"
          className="min-h-12 w-full justify-center gap-2 text-base"
          onClick={recorder.start}
        >
          <Circle aria-hidden="true" className="size-4 fill-destructive text-destructive" />
          {RECORDING_START_LABEL}
        </Button>
      </section>
    );
  }

  if (collecting) {
    return (
      <section
        aria-label="Enregistrement du parcours"
        className={cn("space-y-2", className)}
      >
        <p role="status" className="flex items-center gap-2 text-sm font-medium">
          <Circle
            aria-hidden="true"
            className={cn(
              "size-3 shrink-0 text-destructive",
              state.status === "recording" ? "animate-pulse fill-destructive" : undefined,
            )}
          />
          {state.status === "recording"
            ? RECORDING_ACTIVE_LABEL
            : RECORDING_ACQUIRING_LABEL}
        </p>
        <dl className="grid grid-cols-2 gap-2 text-center">
          <div>
            <dd className="text-2xl font-semibold leading-8 tabular-nums">
              {formatElapsedLabel(elapsedMs)}
            </dd>
            <dt className="text-xs leading-4 text-muted-foreground">temps écoulé</dt>
          </div>
          <div>
            <dd className="text-2xl font-semibold leading-8 tabular-nums">
              {formatDistanceLabel(state.distanceKm)}
            </dd>
            <dt className="text-xs leading-4 text-muted-foreground">distance</dt>
          </div>
        </dl>
        {state.error ? (
          <p role="status" className="text-sm leading-6 text-muted-foreground">
            {state.error.message}
          </p>
        ) : null}
        <Button
          type="button"
          variant="destructive"
          className="min-h-14 w-full gap-2 text-base font-semibold"
          onClick={recorder.stop}
        >
          <Square aria-hidden="true" className="size-5" />
          {RECORDING_STOP_LABEL}
        </Button>
      </section>
    );
  }

  const exporting = state.status === "exporting";
  // Une erreur sans aucun point (permission refusée, GPS indisponible) n'a rien
  // à supprimer : elle se ferme, elle ne se confirme pas.
  const nothingToDelete = state.status === "error" && state.points.length === 0;

  return (
    <section
      aria-label="Enregistrement du parcours"
      className={cn("space-y-2", className)}
    >
      <p className="text-sm font-medium">
        {state.status === "error" ? "Enregistrement interrompu" : RECORDING_PREVIEW_LABEL}
      </p>
      {state.status !== "error" ? (
        <dl className="grid grid-cols-2 gap-2 text-center">
          <div>
            <dd className="text-2xl font-semibold leading-8 tabular-nums">
              {formatElapsedLabel(elapsedMs)}
            </dd>
            <dt className="text-xs leading-4 text-muted-foreground">durée</dt>
          </div>
          <div>
            <dd className="text-2xl font-semibold leading-8 tabular-nums">
              {formatDistanceLabel(state.distanceKm)}
            </dd>
            <dt className="text-xs leading-4 text-muted-foreground">distance</dt>
          </div>
        </dl>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-sm leading-6 text-muted-foreground">
          {state.error.message}
        </p>
      ) : null}

      {state.exportedFileName ? (
        <p role="status" className="text-sm leading-6 text-muted-foreground">
          {recordingExportedMessage(state.exportedFileName)}
        </p>
      ) : null}

      {confirmDelete ? (
        <div
          role="alertdialog"
          aria-label={RECORDING_DELETE_LABEL}
          className="space-y-2"
        >
          <p className="text-sm leading-6">{RECORDING_DELETE_CONFIRM_QUESTION}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-12 text-base"
              onClick={() => setConfirmDelete(false)}
            >
              {RECORDING_KEEP_LABEL}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-12 text-base"
              onClick={() => {
                setConfirmDelete(false);
                recorder.discard();
              }}
            >
              {RECORDING_DELETE_CONFIRM_LABEL}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          {state.status !== "error" ? (
            <Button
              type="button"
              className="min-h-12 w-full gap-2 text-base"
              disabled={exporting || !recorder.canExport}
              aria-busy={exporting}
              onClick={() => {
                void recorder.save();
              }}
            >
              <Save aria-hidden="true" className="size-5" />
              {exporting ? RECORDING_EXPORTING_LABEL : RECORDING_EXPORT_LABEL}
            </Button>
          ) : null}
          <Button
            type="button"
            variant={
              state.exportedFileName || nothingToDelete ? "outline" : "destructive"
            }
            className="min-h-12 w-full gap-2 text-base"
            disabled={exporting}
            onClick={() => {
              // Un parcours déjà exporté n'a plus rien à perdre : on le ferme
              // sans confirmation. Sinon la suppression est irréversible.
              if (state.exportedFileName || nothingToDelete) {
                recorder.discard();
                return;
              }
              setConfirmDelete(true);
            }}
          >
            {state.exportedFileName || nothingToDelete ? null : (
              <Trash2 aria-hidden="true" className="size-5" />
            )}
            {nothingToDelete
              ? RECORDING_DISMISS_LABEL
              : state.exportedFileName
                ? RECORDING_FINISH_LABEL
                : RECORDING_DELETE_LABEL}
          </Button>
        </div>
      )}
    </section>
  );
}
