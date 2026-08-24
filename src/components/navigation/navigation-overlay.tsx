"use client";

import { LocateFixed, Volume2, VolumeX, X } from "lucide-react";
import { FOREGROUND_ONLY_MESSAGE } from "@/domain/navigation/session-copy";
import type { RideGenerationError } from "@/domain/ride/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatAccuracyLabel,
  formatDistanceLabel,
  formatDurationLabel,
  formatEta,
} from "./format-navigation";

const TOUCH_TARGET = "min-h-12 min-w-12 size-12 rounded-full";

export type NavigationOverlayProps = {
  arrow: string;
  instruction: string;
  nextRoad?: string;
  distanceToManeuverKm: number;
  remainingDistanceKm: number;
  remainingMinutes: number;
  nowMs: number;
  accuracyMeters: number | null;
  gpsError: string | null;
  recalculating: boolean;
  hidden: boolean;
  muted: boolean;
  recalcError: RideGenerationError | null;
  onMuteToggle: () => void;
  onRecenter: () => void;
  onStop: () => void;
  onRetryRecalculate: () => void;
};

export function NavigationOverlay({
  arrow,
  instruction,
  nextRoad,
  distanceToManeuverKm,
  remainingDistanceKm,
  remainingMinutes,
  nowMs,
  accuracyMeters,
  gpsError,
  recalculating,
  hidden,
  muted,
  recalcError,
  onMuteToggle,
  onRecenter,
  onStop,
  onRetryRecalculate,
}: NavigationOverlayProps) {
  const gpsStatus = gpsError ?? formatAccuracyLabel(accuracyMeters);
  const etaLabel = formatEta(nowMs, remainingMinutes);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col">
      <div className="pt-[max(0.75rem,env(safe-area-inset-top,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] pl-[max(0.75rem,env(safe-area-inset-left,0px))]">
        <header
          aria-label="Prochaine manœuvre"
          className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-primary px-3 py-3 text-primary-foreground shadow-lg"
        >
          <p
            aria-hidden="true"
            className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/15 text-3xl leading-none"
          >
            {arrow}
          </p>
          <div className="min-w-0 flex-1">
            <p className="text-3xl font-semibold leading-none tracking-tight tabular-nums">
              {formatDistanceLabel(distanceToManeuverKm)}
            </p>
            {nextRoad ? (
              <p className="mt-1 truncate text-base font-medium leading-6">
                {nextRoad}
              </p>
            ) : null}
            <p className="truncate text-sm leading-6 text-primary-foreground/80">
              {instruction}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            aria-label={muted ? "Son" : "Muet"}
            aria-pressed={muted}
            className={cn(
              TOUCH_TARGET,
              "shrink-0 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground",
            )}
            onClick={onMuteToggle}
          >
            {muted ? (
              <VolumeX aria-hidden="true" className="size-6" />
            ) : (
              <Volume2 aria-hidden="true" className="size-6" />
            )}
          </Button>
        </header>
      </div>

      <div className="mt-auto flex flex-col gap-3 pr-[max(0.75rem,env(safe-area-inset-right,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pl-[max(0.75rem,env(safe-area-inset-left,0px))]">
        <Button
          type="button"
          variant="secondary"
          aria-label="Recentrer"
          className={cn(TOUCH_TARGET, "pointer-events-auto self-end shadow-lg")}
          onClick={onRecenter}
        >
          <LocateFixed aria-hidden="true" className="size-6" />
        </Button>

        <footer
          aria-label="Arrivée estimée"
          className="pointer-events-auto w-full space-y-2 rounded-2xl bg-card px-3 py-3 text-card-foreground shadow-lg ring-1 ring-foreground/10"
        >
          <div className="flex items-center gap-2">
            <div className="grid min-w-0 flex-1 grid-cols-3 text-center">
              <div className="min-w-0">
                <p className="truncate text-xl font-semibold leading-7 tabular-nums">
                  {etaLabel}
                </p>
                <p className="text-xs leading-4 text-muted-foreground">arrivée</p>
              </div>
              <div className="min-w-0">
                <p className="truncate text-xl font-semibold leading-7 tabular-nums">
                  {formatDurationLabel(remainingMinutes)}
                </p>
                <p className="text-xs leading-4 text-muted-foreground">restant</p>
              </div>
              <div className="min-w-0">
                <p className="truncate text-xl font-semibold leading-7 tabular-nums">
                  {formatDistanceLabel(remainingDistanceKm)}
                </p>
                <p className="text-xs leading-4 text-muted-foreground">distance</p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              aria-label="Arrêter"
              className={cn(TOUCH_TARGET, "shrink-0")}
              onClick={onStop}
            >
              <X aria-hidden="true" className="size-6" />
            </Button>
          </div>

          <p className="text-sm leading-6" role="status">
            {gpsStatus}
            {recalculating ? " · Recalcul du trajet…" : ""}
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            {FOREGROUND_ONLY_MESSAGE}
          </p>
          {hidden ? (
            <p role="status" className="text-sm text-destructive">
              La navigation nécessite que l’application reste ouverte au premier
              plan.
            </p>
          ) : null}
          {recalcError ? (
            <div role="alert" className="space-y-2 text-sm">
              <p className="text-destructive">{recalcError.message}</p>
              <Button
                type="button"
                className="min-h-12 min-w-12"
                onClick={onRetryRecalculate}
              >
                Réessayer
              </Button>
            </div>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
