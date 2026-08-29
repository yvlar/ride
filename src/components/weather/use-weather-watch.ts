"use client";

import { useEffect, useMemo, useState } from "react";
import type { Coordinates } from "@/domain/geo/types";
import {
  weatherEscapeAdvice,
  type WeatherEscapeAdvice,
} from "@/domain/weather/escape-direction";
import { roundToWeatherCell } from "@/domain/weather/sample-grid";
import {
  WEATHER_UNAVAILABLE_MESSAGE,
  requestWeather,
  type WeatherReport,
} from "./request-weather";

/** Radar and forecast both move slowly; ten minutes is the useful cadence. */
export const WEATHER_REFRESH_MS = 10 * 60_000;

export type WeatherWatchStatus = "idle" | "loading" | "ready" | "error";

export type WeatherWatchOptions = {
  /** False while the layer is off: nothing is fetched (FR-043). */
  enabled: boolean;
  center: Coordinates | null;
  radiusKm?: number;
  load?: typeof requestWeather;
  refreshMs?: number;
};

export type WeatherWatch = {
  report: WeatherReport | null;
  /** Recomputed from the rider's exact position, not the fetch anchor. */
  advice: WeatherEscapeAdvice | null;
  status: WeatherWatchStatus;
  error: string | null;
  refresh: () => void;
};

/**
 * FR-043 — keeps one weather field alive while the layer is on: fetched for a
 * coarse anchor so a moving rider does not refetch on every GPS fix, refreshed
 * on a timer, and read back against their exact position.
 */
export function useWeatherWatch({
  enabled,
  center,
  radiusKm,
  load = requestWeather,
  refreshMs = WEATHER_REFRESH_MS,
}: WeatherWatchOptions): WeatherWatch {
  const [report, setReport] = useState<WeatherReport | null>(null);
  const [status, setStatus] = useState<WeatherWatchStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const latitude = center?.latitude ?? null;
  const longitude = center?.longitude ?? null;
  // Rounded first, memoised second: the anchor keeps its identity across every
  // fix inside the same cell, so riding does not refetch the field (FR-043).
  const anchorLatitude =
    latitude === null ? null : roundToWeatherCell(latitude);
  const anchorLongitude =
    longitude === null ? null : roundToWeatherCell(longitude);
  const anchor = useMemo(
    () =>
      anchorLatitude === null || anchorLongitude === null
        ? null
        : { latitude: anchorLatitude, longitude: anchorLongitude },
    [anchorLatitude, anchorLongitude],
  );

  useEffect(() => {
    if (!enabled || !anchor) {
      return;
    }
    const controller = new AbortController();
    void load(anchor, { radiusKm, signal: controller.signal })
      .then((next) => {
        if (!controller.signal.aborted) {
          setReport(next);
          setError(null);
          setStatus("ready");
        }
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setError(
          reason instanceof Error ? reason.message : WEATHER_UNAVAILABLE_MESSAGE,
        );
        setStatus("error");
      });
    return () => controller.abort();
  }, [anchor, enabled, load, radiusKm, reloadKey]);

  useEffect(() => {
    if (!enabled || refreshMs <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setReloadKey((value) => value + 1);
    }, refreshMs);
    return () => clearInterval(timer);
  }, [enabled, refreshMs]);

  const advice = useMemo(() => {
    if (!report) {
      return null;
    }
    return weatherEscapeAdvice(
      report.field,
      latitude === null || longitude === null
        ? report.field.center
        : { latitude, longitude },
    );
  }, [latitude, longitude, report]);

  return {
    report: enabled ? report : null,
    advice: enabled ? advice : null,
    // The first fetch is in flight as soon as the layer is on: reporting
    // "idle" there would leave the panel with nothing to say (FR-042).
    status: !enabled ? "idle" : status === "idle" ? "loading" : status,
    error: enabled ? error : null,
    refresh: () => setReloadKey((value) => value + 1),
  };
}
