"use client";

import { useEffect, useRef, useState } from "react";
import type { Coordinates } from "@/domain/geo/types";
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
import { toRideMapViewModel } from "@/components/map/ride-map-view-model";
import { cn } from "@/lib/utils";

export type NavigationMapProps = {
  route: GeneratedRideRoute;
  userLocation?: Coordinates | null;
  engine?: NavigationMapEngine;
  onRecenterReady?: (recenter: () => void) => void;
};

export function NavigationMap({
  route,
  userLocation,
  engine,
  onRecenterReady,
}: NavigationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<NavigationMapHandle | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const viewModel = toRideMapViewModel(route);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !viewModel) {
      setError(viewModel ? null : MAP_UNAVAILABLE_MESSAGE);
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
    };

    const resolved = engine ?? createNavigationMapEngine();
    const handle = resolved.mount(container, viewModel, handlers);
    handleRef.current = handle;
    onRecenterReady?.(() => handle.recenter());
    if (cancelled) {
      handle.destroy();
    }

    return () => {
      cancelled = true;
      handle.destroy();
      handleRef.current = undefined;
    };
  }, [engine, onRecenterReady, route, viewModel]);

  useEffect(() => {
    handleRef.current?.setUserLocation(userLocation ?? null);
  }, [userLocation]);

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
