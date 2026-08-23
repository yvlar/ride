"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GeneratedRideRoute } from "@/domain/ride/types";
import { cn } from "@/lib/utils";
import {
  browserPlatform,
  prefersLightweightNavigationMap,
} from "./browser-map-platform";
import {
  MAP_UNAVAILABLE_MESSAGE,
  type MapEngine,
  type MapEngineHandle,
} from "./map-engine";
import { toRideMapViewModel } from "./ride-map-view-model";

export type RideMapProps = {
  route: GeneratedRideRoute;
  engine?: MapEngine;
};

export function RideMap({ route, engine }: RideMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<MapEngineHandle | undefined>(undefined);
  const viewModelRef = useRef(toRideMapViewModel(route));
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const viewModel = useMemo(() => toRideMapViewModel(route), [route]);
  const hasViewModel = Boolean(viewModel);

  useEffect(() => {
    viewModelRef.current = viewModel;
  }, [viewModel]);

  useEffect(() => {
    const container = containerRef.current;
    const initial = viewModelRef.current;
    if (!container || !initial) {
      setError(initial ? null : MAP_UNAVAILABLE_MESSAGE);
      return;
    }

    setError(null);
    setWarning(null);
    let cancelled = false;
    let handle: MapEngineHandle | undefined;

    void (async () => {
      try {
        const resolved =
          engine ??
          (prefersLightweightNavigationMap(browserPlatform())
            ? (await import("./lightweight-navigation-map-engine"))
                .createLightweightNavigationMapEngine()
            : (await import("./maplibre-map-engine")).createMapLibreEngine());
        if (cancelled) {
          return;
        }
        handle = resolved.mount(container, initial, {
          onError: (message) => {
            if (!cancelled) {
              setError(message);
            }
          },
          onWarning: (message) => {
            if (!cancelled) {
              setWarning(message);
            }
          },
        });
        handleRef.current = handle;
        const latest = viewModelRef.current;
        if (latest) {
          handle.setViewModel?.(latest);
        }
        if (cancelled) {
          handle.destroy();
          handleRef.current = undefined;
        }
      } catch {
        if (!cancelled) {
          setError(MAP_UNAVAILABLE_MESSAGE);
        }
      }
    })();

    return () => {
      cancelled = true;
      handle?.destroy();
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

  return (
    <section aria-label="Carte du trajet" className="space-y-2">
      {viewModel ? (
        <>
          <p className="text-sm leading-6">{viewModel.directionLabel}</p>
          <ul className="space-y-1 text-sm leading-6 text-muted-foreground">
            <li>
              {viewModel.start.label} : {viewModel.start.placeLabel}
            </li>
            {viewModel.destination ? (
              <li>
                {viewModel.destination.label} : {viewModel.destination.placeLabel}
              </li>
            ) : null}
          </ul>
        </>
      ) : null}
      {error ? (
        <p role="status" className="text-sm leading-6 text-muted-foreground">
          {error}
        </p>
      ) : null}
      {warning && !error ? (
        <p role="status" className="text-sm leading-6 text-muted-foreground">
          {warning}
        </p>
      ) : null}
      <div
        ref={containerRef}
        className={cn(
          "h-64 min-h-64 w-full overflow-hidden rounded-lg border border-border bg-muted",
          error ? "hidden" : undefined,
        )}
      />
    </section>
  );
}
