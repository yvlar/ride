"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { haversineKm } from "@/domain/geo/distance";
import type { Coordinates } from "@/domain/geo/types";
import type { WeatherOverlay } from "@/domain/weather/types";
import {
  weatherDirectionAdvice,
  type WeatherDirectionAdvice,
} from "@/domain/weather/weather-directions";
import { WEATHER_DEFAULT_RADIUS_KM } from "@/domain/weather/weather-grid";
import {
  requestWeatherOverlay,
  WEATHER_UNAVAILABLE_MESSAGE,
  type RequestWeatherOverlay,
} from "./request-weather-overlay";

/** Rythme de rafraîchissement : la prévision publiée est horaire. */
export const WEATHER_REFRESH_MS = 10 * 60_000;

/**
 * Distance parcourue à partir de laquelle la nappe précédente ne décrit plus
 * l'environnement du pilote. Un simple arrêt de feu rouge ne relance rien.
 */
export const WEATHER_MOVE_THRESHOLD_KM = 20;

export type WeatherOverlayStatus = "idle" | "loading" | "ready" | "error";

export type WeatherOverlayState = {
  overlay: WeatherOverlay | null;
  advice: WeatherDirectionAdvice;
  status: WeatherOverlayStatus;
  error: string | null;
  refresh: () => void;
};

export type UseWeatherOverlayOptions = {
  /** Le pilote affiche la couche météo. Éteinte, elle ne consomme rien. */
  enabled: boolean;
  /** Position du pilote, sinon départ du trajet. `null` suspend les relevés. */
  center: Coordinates | null;
  radiusKm?: number;
  refreshMs?: number;
  moveThresholdKm?: number;
  /** Couture de test : par défaut l'appel HTTP vers `/api/weather`. */
  request?: RequestWeatherOverlay;
};

/**
 * FR-043 — tient la nappe météo à jour pendant que le pilote roule : nouveau
 * relevé quand il s'est déplacé, et de toute façon toutes les dix minutes. Une
 * panne réseau conserve le dernier relevé plutôt que de vider la carte, en le
 * signalant.
 */
export function useWeatherOverlay({
  enabled,
  center,
  radiusKm = WEATHER_DEFAULT_RADIUS_KM,
  refreshMs = WEATHER_REFRESH_MS,
  moveThresholdKm = WEATHER_MOVE_THRESHOLD_KM,
  request,
}: UseWeatherOverlayOptions): WeatherOverlayState {
  const [overlay, setOverlay] = useState<WeatherOverlay | null>(null);
  const [status, setStatus] = useState<WeatherOverlayStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const requestOverlay = request ?? requestWeatherOverlay;
  const requestRef = useRef(requestOverlay);
  const abortRef = useRef<AbortController | null>(null);
  const attemptRef = useRef(0);
  const fetchedCenterRef = useRef<Coordinates | null>(null);
  const centerRef = useRef(center);

  useEffect(() => {
    requestRef.current = requestOverlay;
  }, [requestOverlay]);

  useEffect(() => {
    centerRef.current = center;
  }, [center]);

  const load = useCallback(
    (target: Coordinates) => {
      // Un relevé plus récent rend le précédent inutile : on l'annule pour ne
      // pas repeindre la carte avec une nappe périmée.
      abortRef.current?.abort();
      const controller =
        typeof AbortController === "undefined" ? null : new AbortController();
      abortRef.current = controller;
      attemptRef.current += 1;
      const attempt = attemptRef.current;
      fetchedCenterRef.current = target;
      setStatus("loading");

      void requestRef
        .current(target, { radiusKm, signal: controller?.signal })
        .then((next) => {
          if (attempt !== attemptRef.current) {
            return;
          }
          setOverlay(next);
          setError(null);
          setStatus("ready");
        })
        .catch((cause: unknown) => {
          if (attempt !== attemptRef.current) {
            return;
          }
          // Un nouveau relevé pourra repartir de la position suivante.
          fetchedCenterRef.current = null;
          setError(
            cause instanceof Error && cause.message
              ? cause.message
              : WEATHER_UNAVAILABLE_MESSAGE,
          );
          setStatus("error");
        });
    },
    [radiusKm],
  );

  const refresh = useCallback(() => {
    const target = centerRef.current;
    if (!target) {
      return;
    }
    load(target);
  }, [load]);

  useEffect(() => {
    if (!enabled) {
      abortRef.current?.abort();
      abortRef.current = null;
      // Le compteur avance : une réponse encore en vol ne repeindra pas la
      // couche que le pilote vient d'éteindre.
      attemptRef.current += 1;
      fetchedCenterRef.current = null;
      return;
    }
    if (!center) {
      return;
    }
    const fetched = fetchedCenterRef.current;
    if (fetched && haversineKm(fetched, center) < moveThresholdKm) {
      return;
    }
    load(center);
  }, [enabled, center, moveThresholdKm, load]);

  useEffect(() => {
    if (!enabled || refreshMs <= 0) {
      return;
    }
    const timer = setInterval(() => {
      refresh();
    }, refreshMs);
    return () => clearInterval(timer);
  }, [enabled, refreshMs, refresh]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  /**
   * La nappe visible est dérivée, jamais effacée dans un effet : couche
   * éteinte, ou pilote reparti trop loin du dernier relevé, elle disparaît sans
   * qu'un rendu en cascade ne soit nécessaire.
   */
  const visibleOverlay =
    enabled &&
    overlay &&
    (!center || haversineKm(overlay.center, center) < moveThresholdKm)
      ? overlay
      : null;
  const visibleStatus: WeatherOverlayStatus = !enabled
    ? "idle"
    : status === "error"
      ? "error"
      : visibleOverlay && status === "ready"
        ? "ready"
        : "loading";
  const advice = useMemo(
    () => weatherDirectionAdvice(visibleOverlay),
    [visibleOverlay],
  );

  return {
    overlay: visibleOverlay,
    advice,
    status: visibleStatus,
    error: enabled ? error : null,
    refresh,
  };
}
