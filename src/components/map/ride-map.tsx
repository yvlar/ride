"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Coordinates } from "@/domain/geo/types";
import type { GpxMapOverlay } from "@/domain/gpx/types";
import type { GeneratedRideRoute } from "@/domain/ride/types";
import { cn } from "@/lib/utils";
import {
  MAP_UNAVAILABLE_MESSAGE,
  type MapEngine,
  type MapEngineHandle,
} from "./map-engine";
import type { RecordedTrackOverlay } from "./recorded-track-overlay";
import { idleMapViewModel, toRideMapViewModel } from "./ride-map-view-model";

export type RideMapProps = {
  route: GeneratedRideRoute | null;
  overlay?: GpxMapOverlay | null;
  engine?: MapEngine;
  userLocation?: Coordinates | null;
  headingDeg?: number | null;
  /** Live GPS recording trace, independent of the planned route (FR-041). */
  recordedTrack?: RecordedTrackOverlay | null;
  /** Recording owns the shared LocationWatch; no second GPS watch (FR-041, NFR-006). */
  recordingActive?: boolean;
  expanded?: boolean;
  /** Fill the parent without enabling navigation follow-user (explorer map). */
  fill?: boolean;
  /** FR-042 — distance ridden, to dim the portion already behind. */
  traveledKm?: number;
  onRecenterReady?: (recenter: () => void) => void;
  onOverviewReady?: (overview: () => void) => void;
  onGeolocateReady?: (setEnabled: (enabled: boolean) => void) => void;
  onFollowUserChange?: (following: boolean) => void;
  /** FR-038 — arm click / long-press / marker-drag destination picking. */
  pickMode?: boolean;
  /** Coordinates of the draggable destination marker, when one is placed. */
  pickMarker?: Coordinates | null;
  onPick?: (coordinates: Coordinates) => void;
  /** Accessible name, so a picker map is not announced as the route map. */
  label?: string;
};

export function RideMap({
  route,
  overlay = null,
  engine,
  userLocation,
  headingDeg = null,
  recordedTrack = null,
  recordingActive = false,
  expanded = false,
  fill = false,
  traveledKm = 0,
  onRecenterReady,
  onOverviewReady,
  onGeolocateReady,
  onFollowUserChange,
  pickMode = false,
  pickMarker = null,
  onPick,
  label = "Carte du trajet",
}: RideMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<MapEngineHandle | undefined>(undefined);
  const viewModelRef = useRef(
    route ? toRideMapViewModel(route) : idleMapViewModel(),
  );
  const onRecenterReadyRef = useRef(onRecenterReady);
  const onOverviewReadyRef = useRef(onOverviewReady);
  const onGeolocateReadyRef = useRef(onGeolocateReady);
  const onFollowUserChangeRef = useRef(onFollowUserChange);
  const userLocationRef = useRef(userLocation);
  const headingDegRef = useRef(headingDeg);
  const recordedTrackRef = useRef(recordedTrack);
  const geolocateEnabled = !expanded && !recordingActive;
  const geolocateEnabledRef = useRef(geolocateEnabled);
  const expandedRef = useRef(expanded);
  const onPickRef = useRef(onPick);
  const pickModeRef = useRef(pickMode);
  const pickMarkerRef = useRef(pickMarker);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const viewModel = useMemo(
    () =>
      route ? toRideMapViewModel(route, overlay, traveledKm) : idleMapViewModel(),
    [route, overlay, traveledKm],
  );
  const mountedViewModelRef = useRef(viewModel);
  const hasViewModel = Boolean(viewModel);
  const fillContainer = expanded || fill;

  useEffect(() => {
    viewModelRef.current = viewModel;
  }, [viewModel]);

  useEffect(() => {
    onRecenterReadyRef.current = onRecenterReady;
  }, [onRecenterReady]);

  useEffect(() => {
    onOverviewReadyRef.current = onOverviewReady;
  }, [onOverviewReady]);

  useEffect(() => {
    onGeolocateReadyRef.current = onGeolocateReady;
  }, [onGeolocateReady]);

  useEffect(() => {
    onFollowUserChangeRef.current = onFollowUserChange;
  }, [onFollowUserChange]);

  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  useEffect(() => {
    headingDegRef.current = headingDeg;
  }, [headingDeg]);

  useEffect(() => {
    recordedTrackRef.current = recordedTrack;
  }, [recordedTrack]);

  useEffect(() => {
    geolocateEnabledRef.current = geolocateEnabled;
  }, [geolocateEnabled]);

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
          (await import("./maplibre-map-engine")).createMapLibreEngine();
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
          onFollowUserChange: (following) => {
            if (!cancelled) {
              onFollowUserChangeRef.current?.(following);
            }
          },
          onPick: (coordinates) => {
            if (!cancelled) {
              onPickRef.current?.(coordinates);
            }
          },
        });
        handleRef.current = handle;
        const latest = viewModelRef.current ?? initial;
        mountedViewModelRef.current = latest;
        if (latest !== initial) {
          handle.setViewModel?.(latest);
        }
        handle.setUserLocation?.(
          userLocationRef.current ?? null,
          headingDegRef.current,
        );
        handle.setRecordedTrack?.(recordedTrackRef.current ?? null);
        handle.setGeolocateEnabled?.(geolocateEnabledRef.current);
        handle.setFollowUser?.(expandedRef.current);
        handle.setPickEnabled?.(pickModeRef.current);
        handle.setPickMarker?.(pickMarkerRef.current ?? null);
        onRecenterReadyRef.current?.(() => handle?.recenter?.());
        onOverviewReadyRef.current?.(() => handle?.overview?.());
        onGeolocateReadyRef.current?.((enabled) => {
          handle?.setGeolocateEnabled?.(enabled);
        });
        if (cancelled) {
          handle.destroy();
          handleRef.current = undefined;
        }
      } catch {
        if (cancelled) {
          return;
        }
        try {
          const fallback = (
            await import("./lightweight-navigation-map-engine")
          ).createLightweightNavigationMapEngine();
          if (cancelled) {
            return;
          }
          handle = fallback.mount(container, initial, {
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
            onPick: (coordinates) => {
              if (!cancelled) {
                onPickRef.current?.(coordinates);
              }
            },
          });
          handleRef.current = handle;
          const latest = viewModelRef.current ?? initial;
          mountedViewModelRef.current = latest;
          if (latest !== initial) {
            handle.setViewModel?.(latest);
          }
          handle.setUserLocation?.(
            userLocationRef.current ?? null,
            headingDegRef.current,
          );
          handle.setRecordedTrack?.(recordedTrackRef.current ?? null);
          handle.setGeolocateEnabled?.(geolocateEnabledRef.current);
          handle.setFollowUser?.(expandedRef.current);
          handle.setPickEnabled?.(pickModeRef.current);
          handle.setPickMarker?.(pickMarkerRef.current ?? null);
          onRecenterReadyRef.current?.(() => handle?.recenter?.());
        onOverviewReadyRef.current?.(() => handle?.overview?.());
          onGeolocateReadyRef.current?.((enabled) => {
            handle?.setGeolocateEnabled?.(enabled);
          });
        } catch {
          if (!cancelled) {
            setError(MAP_UNAVAILABLE_MESSAGE);
          }
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
    if (!viewModel || !handleRef.current) {
      return;
    }
    if (viewModel === mountedViewModelRef.current) {
      return;
    }
    mountedViewModelRef.current = viewModel;
    handleRef.current.setViewModel?.(viewModel);
  }, [viewModel]);

  useEffect(() => {
    handleRef.current?.setUserLocation?.(userLocation ?? null, headingDeg);
  }, [userLocation, headingDeg]);

  useEffect(() => {
    handleRef.current?.setRecordedTrack?.(recordedTrack ?? null);
  }, [recordedTrack]);

  useEffect(() => {
    pickModeRef.current = pickMode;
    handleRef.current?.setPickEnabled?.(pickMode);
  }, [pickMode]);

  useEffect(() => {
    pickMarkerRef.current = pickMarker;
    handleRef.current?.setPickMarker?.(pickMarker ?? null);
  }, [pickMarker]);

  useLayoutEffect(() => {
    handleRef.current?.setGeolocateEnabled?.(geolocateEnabled);
    handleRef.current?.setFollowUser?.(expanded);
    const frame = requestAnimationFrame(() => {
      handleRef.current?.resize?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [expanded, geolocateEnabled]);

  return (
    <section
      aria-label={label}
      className={cn(fillContainer ? "relative h-full w-full" : "space-y-2")}
    >
      {viewModel && !fillContainer && !viewModel.idle ? (
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
          "w-full overflow-hidden bg-muted",
          fillContainer
            ? "h-full min-h-full rounded-none border-0"
            : "h-64 min-h-64 rounded-lg border border-border",
          error ? "hidden" : undefined,
        )}
      />
    </section>
  );
}
