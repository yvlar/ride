import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LocationWatch, LocationWatchEvent } from "@/domain/location/types";
import type { GenerateRideRequest, GeneratedLoopRoute } from "@/domain/ride/types";
import { NavigationSession } from "./navigation-session";

const route: GeneratedLoopRoute = {
  id: "loop-1",
  type: "loop",
  start: {
    label: "Granby",
    coordinates: { latitude: 45.4, longitude: -72.7 },
  },
  targetDistanceKm: 2,
  style: "scenic",
  geometry: {
    type: "LineString",
    coordinates: [
      [-72.7, 45.4],
      [-72.68, 45.4],
    ],
  },
  segments: [],
  steps: [
    {
      id: "step:1:turn",
      maneuverType: "turn",
      modifier: "right",
      location: { latitude: 45.4, longitude: -72.68 },
      ref: "112",
      distanceKm: 2,
      durationMinutes: 3,
      geometry: {
        type: "LineString",
        coordinates: [
          [-72.7, 45.4],
          [-72.68, 45.4],
        ],
      },
    },
  ],
  distanceKm: 2,
  durationMinutes: 3,
  statistics: { repeatedRoadPercent: 0 },
  warnings: [],
};

const request: GenerateRideRequest = {
  type: "loop",
  start: route.start,
  targetDistanceKm: 2,
  style: "scenic",
  preferences: { avoidHighways: true, avoidUnpaved: false },
};

function createWatch() {
  const listeners = new Set<(event: LocationWatchEvent) => void>();
  let native = 0;
  const watch: LocationWatch = {
    subscribe(listener) {
      listeners.add(listener);
      native = 1;
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          native = 0;
        }
      };
    },
    activeNativeWatches: () => native,
  };
  return {
    watch,
    emit: (event: LocationWatchEvent) => {
      for (const listener of listeners) {
        listener(event);
      }
    },
    get native() {
      return native;
    },
  };
}

function stubSpeech() {
  return {
    available: true,
    speak: vi.fn(),
    cancel: vi.fn(),
    setMuted: vi.fn(),
  };
}

describe("NavigationSession (FR-023, FR-024, FR-025, NFR-006)", () => {
  it("starts and stops a single location watch on mount and unmount", () => {
    const helper = createWatch();
    const speech = stubSpeech();
    const { unmount } = render(
      <NavigationSession
        route={route}
        request={request}
        onStop={() => {}}
        locationWatch={helper.watch}
        speech={speech}
        recalculate={async () => ({ ok: true, route })}
        mapEngine={{
          mount: () => ({
            destroy: vi.fn(),
            setUserLocation: vi.fn(),
            recenter: vi.fn(),
          }),
        }}
      />,
    );

    expect(helper.native).toBe(1);
    expect(helper.watch.activeNativeWatches()).toBe(1);
    unmount();
    expect(helper.watch.activeNativeWatches()).toBe(0);
    expect(speech.cancel).toHaveBeenCalled();
  });

  it("does not speak while muted and allows stopping navigation", async () => {
    const { watch, emit } = createWatch();
    const speech = stubSpeech();
    const onStop = vi.fn();
    render(
      <NavigationSession
        route={route}
        request={request}
        onStop={onStop}
        locationWatch={watch}
        speech={speech}
        recalculate={async () => ({ ok: true, route })}
        mapEngine={{
          mount: () => ({
            destroy: vi.fn(),
            setUserLocation: vi.fn(),
            recenter: vi.fn(),
          }),
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Muet" }));
    emit({
      type: "fix",
      fix: {
        coordinates: { latitude: 45.4, longitude: -72.7 },
        accuracyMeters: 8,
        recordedAtMs: 1,
      },
    });
    await waitFor(() => {
      expect(screen.getByText(/Tournez à droite/)).toBeInTheDocument();
    });
    expect(speech.speak).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Arrêter" }));
    expect(onStop).toHaveBeenCalled();
  });

  it("uses 48px touch targets for riding controls (NFR-006)", () => {
    render(
      <NavigationSession
        route={route}
        request={request}
        onStop={() => {}}
        locationWatch={createWatch().watch}
        speech={stubSpeech()}
        mapEngine={{
          mount: () => ({
            destroy: vi.fn(),
            setUserLocation: vi.fn(),
            recenter: vi.fn(),
          }),
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Muet" })).toHaveClass("min-h-12");
    expect(screen.getByRole("button", { name: "Recentrer" })).toHaveClass(
      "min-h-12",
    );
    expect(screen.getByRole("button", { name: "Arrêter" })).toHaveClass(
      "min-h-12",
    );
  });
});
