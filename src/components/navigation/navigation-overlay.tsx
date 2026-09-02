"use client";

import { useEffect, useRef, useState } from "react";
import {
  CornerUpLeft,
  LocateFixed,
  Map as MapIcon,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  CARPLAY_ACTIVE_MESSAGE,
  FOLLOW_SUSPENDED_MESSAGE,
  HIDDEN_WITHOUT_CARPLAY_MESSAGE,
  RECENTER_LABEL,
  STOP_NAVIGATION_CONFIRM,
  STOP_NAVIGATION_LABEL,
  VOICE_UNAVAILABLE_LABEL,
} from "@/domain/navigation/session-copy";
import type { NavigationStatus } from "@/domain/navigation/status";
import type { RideGenerationError } from "@/domain/ride/types";
import { Button } from "@/components/ui/button";
import { useMapTheme } from "@/components/theme/map-theme-provider";
import { cn } from "@/lib/utils";
import { ArcadeNumber } from "./arcade-number";
import {
  formatDistanceLabel,
  formatDurationLabel,
  formatEta,
  formatManeuverDistanceLabel,
} from "./format-navigation";

/** Riding gloves need a generous target; 48 px is the floor, not the goal. */
const TOUCH_TARGET = "min-h-12 min-w-12 size-12 rounded-full";

const STATUS_TONE_CLASS: Record<NavigationStatus["tone"], string> = {
  neutral: "ride-glass-strong text-white ring-white/15",
  info: "bg-sky-600 text-white ring-sky-900/20",
  warning: "bg-amber-500 text-black ring-amber-900/30",
  danger: "bg-destructive text-white ring-black/20",
};

export type NavigationOverlayProps = {
  arrow: string;
  instruction: string;
  nextRoad?: string;
  /** The maneuver chained after this one, shown discreetly. */
  followingArrow?: string | null;
  followingInstruction?: string | null;
  distanceToManeuverKm: number;
  remainingDistanceKm: number;
  remainingMinutes: number;
  nowMs: number;
  accuracyMeters: number | null;
  status: NavigationStatus;
  hidden: boolean;
  carPlayConnected?: boolean;
  muted: boolean;
  /** False while the rider is panning the map themselves. */
  followingUser?: boolean;
  destinationLabel?: string | null;
  recalcError: RideGenerationError | null;
  statusLabel?: string | null;
  /** FR-044 — false when speechSynthesis cannot be heard on this device. */
  voiceAvailable?: boolean;
  onMuteToggle: () => void;
  onRecenter: () => void;
  onOverview?: () => void;
  onStop: () => void;
  onRetryRecalculate: () => void;
};

export function NavigationOverlay({
  arrow,
  instruction,
  nextRoad,
  followingArrow = null,
  followingInstruction = null,
  distanceToManeuverKm,
  remainingDistanceKm,
  remainingMinutes,
  nowMs,
  accuracyMeters,
  status,
  hidden,
  carPlayConnected = false,
  muted,
  followingUser = true,
  destinationLabel = null,
  recalcError,
  statusLabel = null,
  voiceAvailable = true,
  onMuteToggle,
  onRecenter,
  onOverview,
  onStop,
  onRetryRecalculate,
}: NavigationOverlayProps) {
  const [confirmStop, setConfirmStop] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const { resolvedTheme } = useMapTheme();
  const arcadeNumbers = resolvedTheme === "kart-arcade";
  const etaLabel = formatEta(nowMs, remainingMinutes);
  const maneuverDistanceLabel = formatManeuverDistanceLabel(
    distanceToManeuverKm,
    accuracyMeters,
  );
  const durationLabel = formatDurationLabel(remainingMinutes);
  const remainingDistanceLabel = formatDistanceLabel(remainingDistanceKm);
  const muteLabel = muted
    ? "Activer le guidage vocal"
    : voiceAvailable
      ? "Couper le guidage vocal"
      : VOICE_UNAVAILABLE_LABEL;
  const showStatus = status.message.length > 0;

  useEffect(() => {
    if (confirmStop) {
      confirmRef.current?.focus();
    }
  }, [confirmStop]);

  return (
    <div
      data-navigation-status={status.phase}
      className={cn(
        "pointer-events-none absolute inset-0 z-10 flex flex-col",
        "landscape:flex-row landscape:items-stretch landscape:justify-between landscape:gap-3",
      )}
    >
      {/* ── Prochaine manœuvre ─────────────────────────────────────── */}
      <div
        className={cn(
          "pt-[max(0.75rem,env(safe-area-inset-top,0px))]",
          "pr-[max(0.75rem,env(safe-area-inset-right,0px))]",
          "pl-[max(0.75rem,env(safe-area-inset-left,0px))]",
          "landscape:w-[min(26rem,46vw)] landscape:shrink-0 landscape:pr-0",
        )}
      >
        <header
          aria-label="Prochaine manœuvre"
          className="ride-map-panel ride-glass-strong pointer-events-auto rounded-3xl"
        >
          <div className="flex items-center gap-3 px-3 py-3">
            <p
              aria-hidden="true"
              className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-white/12 text-4xl leading-none"
            >
              {arrow}
            </p>
            <div className="min-w-0 flex-1">
              <p className="text-4xl font-semibold leading-none tracking-tight tabular-nums">
                {arcadeNumbers ? (
                  <ArcadeNumber
                    text={maneuverDistanceLabel}
                    testId="kart-arcade-maneuver-distance"
                  />
                ) : (
                  maneuverDistanceLabel
                )}
              </p>
              <p className="mt-1 truncate text-lg font-medium leading-6">
                {instruction}
              </p>
              {nextRoad ? (
                <p className="truncate text-base leading-6 text-primary-foreground/85">
                  {nextRoad}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              aria-label={muteLabel}
              aria-pressed={muted}
              className={cn(
                TOUCH_TARGET,
                "shrink-0 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground",
              )}
              onClick={onMuteToggle}
            >
              {muted ? (
                <VolumeX aria-hidden="true" className="size-7" />
              ) : (
                <Volume2 aria-hidden="true" className="size-7" />
              )}
            </Button>
          </div>

          {followingInstruction ? (
            <p
              aria-label="Manœuvre suivante"
              className="flex items-center gap-2 border-t border-primary-foreground/20 px-3 py-2 text-sm leading-5 text-primary-foreground/85"
            >
              <CornerUpLeft aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">
                Puis {followingArrow ? `${followingArrow} ` : ""}
                {followingInstruction}
              </span>
            </p>
          ) : null}
        </header>

        {/* Never colour-only: every state carries its own sentence. */}
        {showStatus ? (
          <p
            role="status"
            data-testid="navigation-status"
            className={cn(
              "pointer-events-auto mt-2 rounded-xl px-3 py-2 text-base font-medium leading-6 shadow-lg ring-1",
              STATUS_TONE_CLASS[status.tone],
            )}
          >
            {status.message}
          </p>
        ) : null}

        {statusLabel ? (
          <p
            role="status"
            className="ride-glass pointer-events-auto mt-2 rounded-2xl px-3 py-2 text-base leading-6 text-white"
          >
            {statusLabel}
          </p>
        ) : null}
      </div>

      {/* ── Panneau bas ─────────────────────────────────────────────── */}
      <div
        className={cn(
          "mt-auto flex flex-col gap-2",
          "pr-[max(0.75rem,env(safe-area-inset-right,0px))]",
          "pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]",
          "pl-[max(0.75rem,env(safe-area-inset-left,0px))]",
          "landscape:mt-0 landscape:w-[min(26rem,46vw)] landscape:shrink-0",
          "landscape:justify-end landscape:pl-0",
          "landscape:pt-[max(0.75rem,env(safe-area-inset-top,0px))]",
        )}
      >
        {/* The recentre affordance grows into a labelled bar the moment the
            rider takes the camera, and stays a small pill otherwise. */}
        {followingUser ? (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              aria-label="Aperçu du trajet"
              className="pointer-events-auto min-h-12 min-w-12 gap-1 rounded-full px-3 shadow-lg"
              onClick={onOverview}
            >
              <MapIcon aria-hidden="true" className="size-6" />
              <span className="pr-1 text-sm font-medium">Aperçu</span>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex justify-end">
              <Button
                type="button"
                variant="secondary"
                aria-label="Aperçu du trajet"
                className="pointer-events-auto min-h-12 min-w-12 gap-1 rounded-full px-3 shadow-lg"
                onClick={onOverview}
              >
                <MapIcon aria-hidden="true" className="size-6" />
                <span className="pr-1 text-sm font-medium">Aperçu</span>
              </Button>
            </div>
            <Button
              type="button"
              data-testid="recenter-prominent"
              aria-label={RECENTER_LABEL}
              className="pointer-events-auto min-h-14 w-full gap-2 rounded-2xl text-base font-semibold shadow-lg"
              onClick={onRecenter}
            >
              <LocateFixed aria-hidden="true" className="size-6" />
              {RECENTER_LABEL}
            </Button>
            <p className="text-center text-sm leading-5 text-muted-foreground">
              {FOLLOW_SUSPENDED_MESSAGE}
            </p>
          </div>
        )}

        <footer
          aria-label="Progression du trajet"
          className="ride-map-panel ride-glass-strong pointer-events-auto w-full space-y-2 rounded-3xl px-3 py-3"
        >
          {destinationLabel ? (
            <p className="truncate text-sm leading-5 text-muted-foreground">
              Vers {destinationLabel}
            </p>
          ) : null}

          {/* Sized to fit "1 h 34 min" in a third of a 393 px screen: these
              numbers are the whole point of the panel and must never clip. */}
          <div className="grid grid-cols-3 gap-1 text-center">
            <div className="min-w-0">
              <p className="overflow-hidden text-[1.35rem] font-semibold leading-8 whitespace-nowrap tabular-nums landscape:text-xl">
                {arcadeNumbers ? <ArcadeNumber text={etaLabel} /> : etaLabel}
              </p>
              <p className="text-xs leading-4 text-muted-foreground">arrivée</p>
            </div>
            <div className="min-w-0">
              <p className="overflow-hidden text-[1.35rem] font-semibold leading-8 whitespace-nowrap tabular-nums landscape:text-xl">
                {arcadeNumbers ? (
                  <ArcadeNumber text={durationLabel} />
                ) : (
                  durationLabel
                )}
              </p>
              <p className="text-xs leading-4 text-muted-foreground">restant</p>
            </div>
            <div className="min-w-0">
              <p className="overflow-hidden text-[1.35rem] font-semibold leading-8 whitespace-nowrap tabular-nums landscape:text-xl">
                {arcadeNumbers ? (
                  <ArcadeNumber text={remainingDistanceLabel} />
                ) : (
                  remainingDistanceLabel
                )}
              </p>
              <p className="text-xs leading-4 text-muted-foreground">distance</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              aria-label={RECENTER_LABEL}
              className={cn(TOUCH_TARGET, "shrink-0")}
              onClick={onRecenter}
            >
              <LocateFixed aria-hidden="true" className="size-6" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              aria-label={muteLabel}
              aria-pressed={muted}
              className={cn(TOUCH_TARGET, "shrink-0")}
              onClick={onMuteToggle}
            >
              {muted ? (
                <VolumeX aria-hidden="true" className="size-6" />
              ) : (
                <Volume2 aria-hidden="true" className="size-6" />
              )}
            </Button>
            <Button
              type="button"
              variant="destructive"
              aria-label={STOP_NAVIGATION_LABEL}
              className="min-h-12 flex-1 gap-2 text-base"
              onClick={() => setConfirmStop(true)}
            >
              <X aria-hidden="true" className="size-5" />
              Terminer
            </Button>
          </div>

          {confirmStop ? (
            <div
              role="alertdialog"
              aria-label={STOP_NAVIGATION_LABEL}
              className="space-y-2 rounded-2xl bg-black/15 p-2"
            >
              <p className="text-base font-medium">{STOP_NAVIGATION_CONFIRM}</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  ref={confirmRef}
                  type="button"
                  variant="outline"
                  className="min-h-12 text-base"
                  onClick={() => setConfirmStop(false)}
                >
                  Continuer
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="min-h-12 text-base"
                  onClick={onStop}
                >
                  Oui, terminer
                </Button>
              </div>
            </div>
          ) : null}

          {hidden && !carPlayConnected ? (
            <p role="status" className="text-sm leading-5 text-destructive">
              {HIDDEN_WITHOUT_CARPLAY_MESSAGE}
            </p>
          ) : null}
          {hidden && carPlayConnected ? (
            <p role="status" className="text-sm leading-5">
              {CARPLAY_ACTIVE_MESSAGE}
            </p>
          ) : null}

          {recalcError ? (
            <div role="alert" className="space-y-2 text-sm">
              <p className="text-destructive">{recalcError.message}</p>
              <Button
                type="button"
                className="min-h-12 w-full"
                onClick={onRetryRecalculate}
              >
                Réessayer le recalcul
              </Button>
            </div>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
