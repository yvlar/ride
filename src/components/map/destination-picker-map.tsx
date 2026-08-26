"use client";

import { useEffect, useRef, useState } from "react";
import type { Coordinates, Place } from "@/domain/geo/types";
import type {
  DestinationPickerMapEngine,
  DestinationPickerMapOptions,
} from "./destination-picker-map-engine";
import { MAP_UNAVAILABLE_MESSAGE } from "./map-engine";

export function DestinationPickerMap({
  center,
  userLocation,
  initialDestination,
  engine,
  onPick,
}: {
  center: Coordinates;
  userLocation?: Coordinates | null;
  initialDestination?: Place | null;
  engine?: DestinationPickerMapEngine;
  onPick: (coordinates: Coordinates) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onPickRef = useRef(onPick);
  const [mountOptions] = useState<DestinationPickerMapOptions>(() => ({
    center: { ...center },
    userLocation: userLocation ? { ...userLocation } : null,
    initialDestination,
    initialBounds: initialDestination?.bounds,
  }));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    let cancelled = false;
    let destroy: (() => void) | undefined;
    setError(null);

    void (async () => {
      try {
        const resolved =
          engine ??
          (await import("./maplibre-destination-picker-engine"))
            .createMapLibreDestinationPickerEngine();
        if (cancelled) {
          return;
        }
        const handle = resolved.mount(
          container,
          mountOptions,
          {
            onPick: (coordinates) => onPickRef.current(coordinates),
            onError: (message) => {
              if (!cancelled) {
                setError(message);
              }
            },
          },
        );
        destroy = handle.destroy;
      } catch {
        if (!cancelled) {
          setError(MAP_UNAVAILABLE_MESSAGE);
        }
      }
    })();

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [engine, mountOptions]);

  return (
    <section aria-label="Carte de sélection de la destination" className="h-full w-full">
      {error ? (
        <p
          role="status"
          className="absolute inset-x-4 top-20 z-10 rounded-lg bg-card p-3 text-sm shadow"
        >
          {error}
        </p>
      ) : null}
      <div ref={containerRef} className="h-full min-h-full w-full bg-muted" />
    </section>
  );
}
