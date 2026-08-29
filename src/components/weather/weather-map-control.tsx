"use client";

import { CloudOff, CloudRain, CloudSun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatRainProbability,
  isWetLevel,
  rainLevelLabel,
} from "@/domain/weather/rain-outlook";
import { WEATHER_ATTRIBUTION } from "@/domain/weather/types";
import {
  isWeatherStale,
  weatherFreshnessLabel,
} from "@/domain/weather/weather-freshness";
import { cn } from "@/lib/utils";
import type { WeatherOverlayState } from "./use-weather-overlay";

export const WEATHER_TOGGLE_LABEL = "Météo";
export const WEATHER_LOADING_MESSAGE = "Relevé météo en cours…";
export const WEATHER_NO_POSITION_MESSAGE =
  "Position inconnue : la météo ne peut pas être située.";

export type WeatherMapControlProps = {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  state: WeatherOverlayState;
  /** Faux quand ni la position ni un départ de trajet ne sont connus. */
  hasCenter: boolean;
  now?: () => number;
  className?: string;
};

/**
 * FR-043 — bouton d'affichage de la couche météo et phrase de décision qui va
 * avec : les nuages disent où il pleut, ce bandeau dit de quel côté rouler.
 */
export function WeatherMapControl({
  enabled,
  onEnabledChange,
  state,
  hasCenter,
  now = () => Date.now(),
  className,
}: WeatherMapControlProps) {
  const { overlay, advice, status, error, refresh } = state;
  const wet = advice.avoid.length > 0;
  const Icon = !enabled ? CloudOff : wet ? CloudRain : CloudSun;
  const nowMs = now();
  const freshness = overlay
    ? weatherFreshnessLabel(overlay.observedAt, nowMs)
    : null;
  const stale = overlay ? isWeatherStale(overlay.observedAt, nowMs) : false;

  return (
    <div
      className={cn(
        "pointer-events-none flex max-w-[min(24rem,calc(100vw-1.5rem))] flex-col items-start gap-2",
        className,
      )}
    >
      <Button
        type="button"
        variant={enabled ? "default" : "secondary"}
        aria-pressed={enabled}
        className="pointer-events-auto min-h-12 gap-2 px-3 text-sm shadow-lg"
        onClick={() => onEnabledChange(!enabled)}
      >
        <Icon aria-hidden="true" className="size-5" />
        {WEATHER_TOGGLE_LABEL}
      </Button>

      {enabled ? (
        <div
          role="status"
          className="pointer-events-auto rounded-xl border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur-md"
        >
          <p className="text-sm leading-5 font-medium">
            {headline({
              hasCenter,
              status,
              hasOverlay: Boolean(overlay),
              error,
              message: advice.message,
            })}
          </p>
          {advice.here && isWetLevel(advice.here.level) ? (
            <p className="mt-1 text-sm leading-5">
              {`${rainLevelLabel(advice.here.level)} sur votre position (${formatRainProbability(
                advice.here.probability,
              )}).`}
            </p>
          ) : null}
          <p className="mt-1 text-xs leading-4 text-muted-foreground">
            {footnote({
              hasOverlay: Boolean(overlay),
              status,
              freshness,
              stale,
            })}
          </p>
          {status === "error" ? (
            <Button
              type="button"
              variant="outline"
              className="mt-2 min-h-12 w-full"
              onClick={refresh}
            >
              Réessayer
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function headline({
  hasCenter,
  status,
  hasOverlay,
  error,
  message,
}: {
  hasCenter: boolean;
  status: WeatherOverlayState["status"];
  hasOverlay: boolean;
  error: string | null;
  message: string;
}): string {
  if (!hasCenter) {
    return WEATHER_NO_POSITION_MESSAGE;
  }
  // Un rafraîchissement périodique ne doit pas effacer la phrase de décision :
  // seul le tout premier relevé affiche une attente.
  if (status === "loading" && !hasOverlay) {
    return WEATHER_LOADING_MESSAGE;
  }
  if (status === "error" && !hasOverlay && error) {
    return error;
  }
  // En panne, le dernier relevé garde du sens : la note en dessous le date.
  return message;
}

function footnote({
  hasOverlay,
  status,
  freshness,
  stale,
}: {
  hasOverlay: boolean;
  status: WeatherOverlayState["status"];
  freshness: string | null;
  stale: boolean;
}): string {
  if (status === "error") {
    return hasOverlay && freshness
      ? `Météo indisponible · dernier relevé ${freshness}`
      : "Météo indisponible pour le moment.";
  }
  if (!hasOverlay) {
    return WEATHER_ATTRIBUTION;
  }
  // Un relevé d'il y a une heure ne décrit plus le ciel : le dire vaut mieux
  // que de le présenter comme la météo du moment.
  if (stale && freshness) {
    return `Relevé périmé ${freshness} · ${WEATHER_ATTRIBUTION}`;
  }
  return freshness
    ? `${WEATHER_ATTRIBUTION} · relevé ${freshness}`
    : WEATHER_ATTRIBUTION;
}
