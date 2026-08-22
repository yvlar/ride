"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GeneratedRideRoute } from "@/domain/ride/types";
import { cn } from "@/lib/utils";
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
  const [error, setError] = useState<string | null>(null);
  const viewModel = useMemo(() => toRideMapViewModel(route), [route]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !viewModel) {
      setError(viewModel ? null : MAP_UNAVAILABLE_MESSAGE);
      return;
    }

    setError(null);
    let cancelled = false;
    let handle: MapEngineHandle | undefined;

    void (async () => {
      try {
        const resolved =
          engine ??
          (await import("./maplibre-map-engine")).createMapLibreEngine();
        if (cancelled) {
          return;
        }
        handle = resolved.mount(container, viewModel, {
          onError: (message) => {
            if (!cancelled) {
              setError(message);
            }
          },
        });
        if (cancelled) {
          handle.destroy();
          handle = undefined;
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
    };
  }, [engine, route, viewModel]);

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
