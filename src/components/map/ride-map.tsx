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

// #region agent log
type RideMapDebugGate = {
  yieldAfterResolve?: () => Promise<void>;
};

let rideMapEffectSeq = 0;

function rideMapAgentLog(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>,
) {
  const entry = {
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };
  const globalWithHook = globalThis as typeof globalThis & {
    __RIDE_MAP_AGENT_LOG__?: (payload: typeof entry) => void;
  };
  globalWithHook.__RIDE_MAP_AGENT_LOG__?.(entry);
  try {
    if (typeof process !== "undefined" && process.versions?.node) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:fs").appendFileSync(
        "/opt/cursor/logs/debug.log",
        `${JSON.stringify(entry)}\n`,
      );
    }
  } catch {
    /* ignore missing fs in a browser bundle */
  }
}
// #endregion

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
    // #region agent log
    const effectId = ++rideMapEffectSeq;
    const containerKey = container
      ? (container.dataset.rideMapDebugId ||= `c${effectId}`)
      : null;
    // #endregion
    if (!container || !viewModel) {
      setError(viewModel ? null : MAP_UNAVAILABLE_MESSAGE);
      return;
    }

    setError(null);
    let cancelled = false;
    let handle: MapEngineHandle | undefined;

    void (async () => {
      try {
        // #region agent log
        rideMapAgentLog("A", "ride-map.tsx:async-enter", "async mount started", {
          effectId,
          cancelled,
          hasEngine: Boolean(engine),
          containerKey,
        });
        // #endregion
        const resolved =
          engine ??
          (await import("./maplibre-map-engine")).createMapLibreEngine();
        // #region agent log
        rideMapAgentLog("A", "ride-map.tsx:after-resolve", "engine resolved", {
          effectId,
          cancelled,
          usedInjectedEngine: Boolean(engine),
          containerKey,
        });
        const yieldAfter = (
          globalThis as typeof globalThis & {
            __RIDE_MAP_DEBUG_GATE__?: RideMapDebugGate;
          }
        ).__RIDE_MAP_DEBUG_GATE__?.yieldAfterResolve;
        if (yieldAfter) {
          await yieldAfter();
        }
        rideMapAgentLog("A", "ride-map.tsx:after-yield", "post-resolve yield done", {
          effectId,
          cancelled,
          containerKey,
        });
        // #endregion
        if (cancelled) {
          // #region agent log
          rideMapAgentLog(
            "A",
            "ride-map.tsx:pre-mount-cancel",
            "skipped mount after cancel",
            {
              effectId,
              cancelled,
              hasHandle: Boolean(handle),
              containerKey,
            },
          );
          // #endregion
          return;
        }
        // #region agent log
        rideMapAgentLog("C", "ride-map.tsx:before-mount", "calling mount", {
          effectId,
          cancelled,
          containerKey,
        });
        // #endregion
        handle = resolved.mount(container, viewModel, {
          onError: (message) => {
            // #region agent log
            rideMapAgentLog("E", "ride-map.tsx:onError", "engine onError", {
              effectId,
              cancelled,
              containerKey,
            });
            // #endregion
            if (!cancelled) {
              setError(message);
            }
          },
        });
        // #region agent log
        rideMapAgentLog("C", "ride-map.tsx:after-mount", "mount returned", {
          effectId,
          cancelled,
          hasHandle: Boolean(handle),
          containerKey,
        });
        // #endregion
        if (cancelled) {
          // #region agent log
          rideMapAgentLog(
            "C",
            "ride-map.tsx:post-mount-cancel",
            "destroying handle after late cancel",
            { effectId, containerKey },
          );
          // #endregion
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
      // #region agent log
      rideMapAgentLog("A", "ride-map.tsx:cleanup", "effect cleanup", {
        effectId,
        hasHandle: Boolean(handle),
        containerKey,
      });
      // #endregion
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
