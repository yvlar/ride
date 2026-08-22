/**
 * FR-013 diagnostic harness for the RideMap mount/unmount race.
 * Does not change production behavior. Uses an injected MapEngine (no WebGL).
 *
 * Run: npx vitest run src/components/map/ride-map.race.test.tsx
 */
import { StrictMode } from "react";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendFileSync } from "node:fs";
import type { Place } from "@/domain/geo/types";
import type { GeneratedLoopRoute } from "@/domain/ride/types";
import type { MapEngine, MapEngineHandle } from "./map-engine";
import { RideMap } from "./ride-map";

const granby: Place = {
  label: "Granby, QC",
  coordinates: { latitude: 45.4001, longitude: -72.7342 },
};

const loop: GeneratedLoopRoute = {
  id: "loop-1",
  type: "loop",
  start: granby,
  targetDistanceKm: 80,
  style: "curvy",
  geometry: {
    type: "LineString",
    coordinates: [
      [-72.7342, 45.4001],
      [-72.7, 45.45],
    ],
  },
  segments: [],
  distanceKm: 80,
  durationMinutes: 70,
  statistics: { repeatedRoadPercent: 4 },
  warnings: [],
};

const loopB: GeneratedLoopRoute = {
  ...loop,
  id: "loop-2",
  geometry: {
    type: "LineString",
    coordinates: [
      [-72.7342, 45.4001],
      [-72.65, 45.5],
    ],
  },
};

type RideMapDebugGate = {
  yieldAfterResolve?: () => Promise<void>;
};

type AgentLog = {
  hypothesisId: string;
  location: string;
  message: string;
  data: Record<string, unknown>;
  timestamp: number;
  id: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __RIDE_MAP_DEBUG_GATE__: RideMapDebugGate | undefined;
  // eslint-disable-next-line no-var
  var __RIDE_MAP_AGENT_LOG__: ((entry: AgentLog) => void) | undefined;
}

function harnessLog(
  hypothesisId: string,
  message: string,
  data: Record<string, unknown>,
) {
  const entry = {
    hypothesisId,
    location: "ride-map.race.test.tsx",
    message,
    data,
    timestamp: Date.now(),
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };
  appendFileSync("/opt/cursor/logs/debug.log", `${JSON.stringify(entry)}\n`);
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function createTrackingEngine(options?: {
  unmountDuringMount?: () => void;
}) {
  const live = new Set<number>();
  const mounts: Array<{
    id: number;
    containerKey: string | undefined;
    liveBefore: number[];
  }> = [];
  const destroys: number[] = [];
  let seq = 0;

  const engine: MapEngine = {
    mount(container) {
      const id = ++seq;
      const liveBefore = [...live];
      live.add(id);
      const containerKey = container.dataset.rideMapDebugId;
      mounts.push({ id, containerKey, liveBefore });
      harnessLog("D", "engine.mount", {
        id,
        containerKey,
        liveBefore,
        liveAfter: [...live],
        reusedContainerWithLiveMap: liveBefore.length > 0,
      });
      options?.unmountDuringMount?.();
      const handle: MapEngineHandle = {
        destroy() {
          live.delete(id);
          destroys.push(id);
          harnessLog("C", "engine.destroy", {
            id,
            containerKey,
            liveAfter: [...live],
          });
        },
      };
      return handle;
    },
  };

  return { engine, live, mounts, destroys };
}

async function flushMicrotasks(times = 5) {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  delete globalThis.__RIDE_MAP_DEBUG_GATE__;
});

afterEach(() => {
  delete globalThis.__RIDE_MAP_DEBUG_GATE__;
});

describe("RideMap mount race harness (FR-013)", () => {
  it("A: unmount while post-resolve yield is pending", async () => {
    const gate = createDeferred();
    const tracker = createTrackingEngine();
    globalThis.__RIDE_MAP_DEBUG_GATE__ = {
      yieldAfterResolve: () => gate.promise,
    };

    const { unmount } = render(<RideMap route={loop} engine={tracker.engine} />);
    await flushMicrotasks();
    harnessLog("A", "before-unmount-while-pending", {
      live: [...tracker.live],
      mounts: tracker.mounts.length,
    });

    unmount();
    harnessLog("A", "after-unmount-before-release", {
      live: [...tracker.live],
      mounts: tracker.mounts.length,
      destroys: tracker.destroys,
    });

    gate.resolve();
    await flushMicrotasks();
    await waitFor(() => {
      expect(tracker.mounts.length + tracker.destroys.length).toBeGreaterThanOrEqual(
        0,
      );
    });

    harnessLog("A", "verdict-unmount-during-pending-resolve", {
      live: [...tracker.live],
      mounts: tracker.mounts,
      destroys: tracker.destroys,
      mountedAfterCancel: tracker.mounts.length > 0,
      liveAfterResume: tracker.live.size,
      closedByFirstGuard: tracker.mounts.length === 0 && tracker.live.size === 0,
      closedBySecondGuard:
        tracker.mounts.length > 0 &&
        tracker.destroys.length === tracker.mounts.length &&
        tracker.live.size === 0,
      leakedLiveMap: tracker.live.size > 0,
    });

    expect(tracker.live.size).toBeGreaterThanOrEqual(0);
  });

  it("C: unmount during mount() after first cancelled check", async () => {
    const gate = createDeferred();
    let unmountRef: (() => void) | undefined;
    const tracker = createTrackingEngine({
      unmountDuringMount: () => {
        unmountRef?.();
      },
    });
    globalThis.__RIDE_MAP_DEBUG_GATE__ = {
      yieldAfterResolve: () => gate.promise,
    };

    const view = render(<RideMap route={loop} engine={tracker.engine} />);
    unmountRef = view.unmount;
    await flushMicrotasks();

    gate.resolve();
    await flushMicrotasks();

    harnessLog("C", "verdict-unmount-during-mount", {
      live: [...tracker.live],
      mounts: tracker.mounts,
      destroys: tracker.destroys,
      secondGuardClosed:
        tracker.mounts.length > 0 &&
        tracker.destroys.includes(tracker.mounts[0]?.id ?? -1) &&
        tracker.live.size === 0,
      leakedLiveMap: tracker.live.size > 0,
    });

    expect(tracker.live.size).toBeGreaterThanOrEqual(0);
  });

  it("D: remount (route change) while first resolve yield is pending", async () => {
    const firstGate = createDeferred();
    const secondGate = createDeferred();
    let yieldCount = 0;
    const tracker = createTrackingEngine();
    globalThis.__RIDE_MAP_DEBUG_GATE__ = {
      yieldAfterResolve: () => {
        yieldCount += 1;
        return yieldCount === 1 ? firstGate.promise : secondGate.promise;
      },
    };

    const view = render(<RideMap route={loop} engine={tracker.engine} />);
    await flushMicrotasks();
    harnessLog("D", "first-effect-held", {
      live: [...tracker.live],
      mounts: tracker.mounts.length,
      yieldCount,
    });

    view.rerender(<RideMap route={loopB} engine={tracker.engine} />);
    await flushMicrotasks();
    harnessLog("D", "after-rerender-both-held", {
      live: [...tracker.live],
      mounts: tracker.mounts.length,
      yieldCount,
    });

    firstGate.resolve();
    await flushMicrotasks();
    harnessLog("D", "after-first-release", {
      live: [...tracker.live],
      mounts: tracker.mounts,
      destroys: tracker.destroys,
    });

    secondGate.resolve();
    await flushMicrotasks();
    harnessLog("D", "verdict-remount-overlap", {
      live: [...tracker.live],
      mounts: tracker.mounts,
      destroys: tracker.destroys,
      yieldCount,
      firstMountedOnReusedContainer: tracker.mounts.some(
        (mount) => mount.liveBefore.length > 0,
      ),
      liveAfterBothResumed: tracker.live.size,
      leakedOrDoubleMap: tracker.live.size > 1,
    });

    expect(tracker.live.size).toBeGreaterThanOrEqual(0);
  });

  it("D-strict: React StrictMode overlap with a shared pending yield", async () => {
    const gate = createDeferred();
    const tracker = createTrackingEngine();
    globalThis.__RIDE_MAP_DEBUG_GATE__ = {
      yieldAfterResolve: () => gate.promise,
    };

    const view = render(
      <StrictMode>
        <RideMap route={loop} engine={tracker.engine} />
      </StrictMode>,
    );
    await flushMicrotasks();
    harnessLog("D", "strict-before-release", {
      live: [...tracker.live],
      mounts: tracker.mounts.length,
    });

    gate.resolve();
    await flushMicrotasks();
    harnessLog("D", "verdict-strict-mode", {
      live: [...tracker.live],
      mounts: tracker.mounts,
      destroys: tracker.destroys,
      leakedOrDoubleMap: tracker.live.size > 1,
    });

    view.unmount();
    await flushMicrotasks();
    harnessLog("D", "strict-after-unmount", {
      live: [...tracker.live],
      mounts: tracker.mounts,
      destroys: tracker.destroys,
    });

    expect(tracker.live.size).toBeGreaterThanOrEqual(0);
  });
});
