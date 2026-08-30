"use client";

import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { radarFrameLabel, selectRadarFrame } from "@/components/map/weather-overlay";
import type { WeatherEscapeAdvice } from "@/domain/weather/escape-direction";
import { cn } from "@/lib/utils";
import type { WeatherReport } from "./request-weather";
import type { WeatherWatchStatus } from "./use-weather-watch";

export const WEATHER_TOGGLE_LABEL = "Météo";
export const WEATHER_TOGGLE_HINT = "Afficher la météo et le radar sur la carte";
export const WEATHER_LOADING_MESSAGE = "Lecture du ciel en cours…";
export const WEATHER_NO_RADAR_MESSAGE =
  "Aucune image radar disponible : les nuages proviennent des prévisions.";
export const WEATHER_COLLAPSE_LABEL = "Réduire les détails météo";
export const WEATHER_EXPAND_LABEL = "Afficher les détails météo";

export type WeatherMapControlProps = {
  active: boolean;
  onToggle: (next: boolean) => void;
  status: WeatherWatchStatus;
  report: WeatherReport | null;
  advice: WeatherEscapeAdvice | null;
  error: string | null;
  /** Radar frame the map is drawing, null for the latest observation. */
  frameId: string | null;
  onFrameChange: (frameId: string | null) => void;
  className?: string;
};

/**
 * FR-043 — the toggle and, once it is on, the sentence that matters: which way
 * the bad weather sits and which way is still open. Off by default, so nothing
 * is fetched until the rider asks for it.
 */
export function WeatherMapControl({
  active,
  onToggle,
  status,
  report,
  advice,
  error,
  frameId,
  onFrameChange,
  className,
}: WeatherMapControlProps) {
  const frames = report?.radar.frames ?? [];
  const selected = selectRadarFrame(frames, frameId);
  /**
   * FR-043 — the panel sits over the very sky it describes. The headline is
   * what a rider reads at a glance, so everything else folds away behind it.
   */
  const [expanded, setExpanded] = useState(true);

  return (
    <section
      aria-label="Météo sur la carte"
      className={cn("pointer-events-auto flex flex-col items-start gap-2", className)}
    >
      <Button
        type="button"
        variant={active ? "default" : "outline"}
        size="lg"
        aria-pressed={active}
        title={WEATHER_TOGGLE_HINT}
        className="min-h-12 min-w-12 px-4 text-base shadow-lg"
        onClick={() => onToggle(!active)}
      >
        {WEATHER_TOGGLE_LABEL}
      </Button>

      {active ? (
        <div className="w-full max-w-sm rounded-xl border border-border bg-card/95 px-3 py-2 text-card-foreground shadow-lg backdrop-blur-md">
          {status === "loading" && !advice ? (
            <p role="status" className="text-sm leading-6">
              {WEATHER_LOADING_MESSAGE}
            </p>
          ) : null}

          {error ? (
            <p role="status" className="text-sm leading-6 text-muted-foreground">
              {error}
            </p>
          ) : null}

          {advice ? (
            <div className="flex items-start gap-2">
              <p className="flex-1 text-base leading-6 font-medium">
                {advice.headline}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={expanded}
                aria-label={
                  expanded ? WEATHER_COLLAPSE_LABEL : WEATHER_EXPAND_LABEL
                }
                className="-mr-1 min-h-9 shrink-0 px-2 text-base"
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? (
                  <ChevronUpIcon aria-hidden="true" />
                ) : (
                  <ChevronDownIcon aria-hidden="true" />
                )}
              </Button>
            </div>
          ) : null}

          {advice && expanded ? (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {advice.detail}
            </p>
          ) : null}

          {expanded && frames.length > 0 ? (
            <div
              role="group"
              aria-label="Image radar"
              className="mt-2 flex flex-wrap items-center gap-1"
            >
              {frames.map((frame) => (
                <Button
                  key={frame.id}
                  type="button"
                  size="sm"
                  variant={frame.id === selected?.id ? "secondary" : "ghost"}
                  aria-pressed={frame.id === selected?.id}
                  className="min-h-9"
                  onClick={() => onFrameChange(frame.id)}
                >
                  {radarFrameLabel(frame, frames)}
                </Button>
              ))}
            </div>
          ) : null}

          {expanded && report && frames.length === 0 ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {WEATHER_NO_RADAR_MESSAGE}
            </p>
          ) : null}

          {expanded && report?.radar.attribution ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {report.radar.attribution}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
