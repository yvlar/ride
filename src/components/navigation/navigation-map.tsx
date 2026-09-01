"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Coordinates } from "@/domain/geo/types";
import type { GpxMapOverlay } from "@/domain/gpx/types";
import type { GeneratedRideRoute } from "@/domain/ride/types";
import {
  MAP_UNAVAILABLE_MESSAGE,
  type MapEngineHandlers,
} from "@/components/map/map-engine";
import {
  createNavigationMapEngine,
  type NavigationMapEngine,
  type NavigationMapHandle,
} from "@/components/map/navigation-map-engine";
import { mapThemeStyle } from "@/components/map/map-theme-styles";
import { toRideMapViewModel } from "@/components/map/ride-map-view-model";
import { useMapTheme } from "@/components/theme/map-theme-provider";
import { cn } from "@/lib/utils";

export type NavigationMapProps = {
  route: GeneratedRideRoute;
  overlay?: GpxMapOverlay | null;
  userLocation?: Coordinates | null;
  headingDeg?: number | null;
  /** FR-042 — distance ridden, to dim the portion already behind. */
  traveledKm?: number;
  engine?: NavigationMapEngine;
  onRecenterReady?: (recenter: () => void) => void;
  onOverviewReady?: (overview: () => void) => void;
  onFollowUserChange?: (following: boolean) => void;
};

export function NavigationMap({
  route,
  overlay = null,
  userLocation,
  headingDeg = null,
  traveledKm = 0,
  engine,
  onRecenterReady,
  onOverviewReady,
  onFollowUserChange,
}: NavigationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<NavigationMapHandle | undefined>(undefined);
  /** FR-045 — the basemap picked in Réglages, resolved against the appearance. */
  const { resolvedTheme, standardTheme } = useMapTheme();
  const mapStyle = useMemo(
    () => mapThemeStyle(resolvedTheme, "navigation", standardTheme),
    [resolvedTheme, standardTheme],
  );
  const mapStyleRef = useRef(mapStyle);
  const onRecenterReadyRef = useRef(onRecenterReady);
  const onOverviewReadyRef = useRef(onOverviewReady);
  const onFollowUserChangeRef = useRef(onFollowUserChange);
  const userLocationRef = useRef(userLocation);
  const headingDegRef = useRef(headingDeg);
  const viewModel = useMemo(
    () => toRideMapViewModel(route, overlay, traveledKm),
    [route, overlay, traveledKm],
  );
  const viewModelRef = useRef(viewModel);
  const [error, setError] = useState<string | null>(null);
  const hasViewModel = Boolean(viewModel);

  useEffect(() => {
    viewModelRef.current = viewModel;
  }, [viewModel]);

  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  useEffect(() => {
    headingDegRef.current = headingDeg;
  }, [headingDeg]);

  useEffect(() => {
    onRecenterReadyRef.current = onRecenterReady;
  }, [onRecenterReady]);

  useEffect(() => {
    onOverviewReadyRef.current = onOverviewReady;
  }, [onOverviewReady]);

  useEffect(() => {
    onFollowUserChangeRef.current = onFollowUserChange;
  }, [onFollowUserChange]);

  useEffect(() => {
    const container = containerRef.current;
    const initial = viewModelRef.current;
    if (!container || !initial) {
      setError(initial ? null : MAP_UNAVAILABLE_MESSAGE);
      return;
    }

    setError(null);
    let cancelled = false;
    const handlers: MapEngineHandlers = {
      onError: (message) => {
        if (!cancelled) {
          setError(message);
        }
      },
      onFollowUserChange: (following) => {
        if (!cancelled) {
          onFollowUserChangeRef.current?.(following);
        }
      },
    };

    const resolved = engine ?? createNavigationMapEngine();
    const handle = resolved.mount(container, initial, handlers, {
      mapStyle: mapStyleRef.current,
    });
    handleRef.current = handle;
    onRecenterReadyRef.current?.(() => handle.recenter());
    onOverviewReadyRef.current?.(() => handle.overview?.());
    handle.setFollowUser?.(true);
    handle.setUserLocation(
      userLocationRef.current ?? null,
      headingDegRef.current,
    );
    if (cancelled) {
      handle.destroy();
    }

    return () => {
      cancelled = true;
      handle.destroy();
      if (handleRef.current === handle) {
        handleRef.current = undefined;
      }
    };
  }, [engine, hasViewModel]);

  useEffect(() => {
    if (!viewModel) {
      return;
    }
    handleRef.current?.setViewModel?.(viewModel);
  }, [viewModel]);

  useEffect(() => {
    handleRef.current?.setUserLocation(userLocation ?? null, headingDeg);
  }, [userLocation, headingDeg]);

  useEffect(() => {
    mapStyleRef.current = mapStyle;
    handleRef.current?.setMapStyle?.(mapStyle);
  }, [mapStyle]);

  return (
    <section aria-label="Carte de navigation" className="relative min-h-0 flex-1">
      {error ? (
        <p role="status" className="p-3 text-sm text-muted-foreground">
          {error}
        </p>
      ) : null}
      <div
        ref={containerRef}
        className={cn(
          "h-full min-h-64 w-full bg-muted",
          error ? "hidden" : undefined,
        )}
      />
    </section>
  );
}
