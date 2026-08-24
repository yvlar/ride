import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LocationWatch, LocationWatchEvent } from "@/domain/location/types";
import { FOREGROUND_ONLY_MESSAGE } from "@/domain/navigation/session-copy";
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
    start() {
      native = 1;
    },
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
    unlock: vi.fn(),
  };
}

function stubMapEngine() {
  return {
    mount: vi.fn(() => ({
      destroy: vi.fn(),
      setUserLocation: vi.fn(),
      recenter: vi.fn(),
      setViewModel: vi.fn(),
    })),
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
        mapEngine={stubMapEngine()}
      />,
    );

    expect(helper.native).toBe(1);
    expect(helper.watch.activeNativeWatches()).toBe(1);
    unmount();
    expect(helper.watch.activeNativeWatches()).toBe(0);
    expect(speech.cancel).toHaveBeenCalled();
  });

  it("keeps a single map mount across GPS updates (NFR-006)", async () => {
    const { watch, emit } = createWatch();
    const destroy = vi.fn();
    const mount = vi.fn(() => ({
      destroy,
      setUserLocation: vi.fn(),
      recenter: vi.fn(),
      setViewModel: vi.fn(),
    }));
    const mapEngine = { mount };
    render(
      <NavigationSession
        route={route}
        request={request}
        onStop={() => {}}
        locationWatch={watch}
        speech={stubSpeech()}
        recalculate={async () => ({ ok: true, route })}
        mapEngine={mapEngine}
      />,
    );

    expect(mount).toHaveBeenCalledTimes(1);
    emit({
      type: "fix",
      fix: {
        coordinates: { latitude: 45.4, longitude: -72.7 },
        accuracyMeters: 8,
        recordedAtMs: 1,
      },
    });
    emit({
      type: "fix",
      fix: {
        coordinates: { latitude: 45.4002, longitude: -72.6998 },
        accuracyMeters: 10,
        recordedAtMs: 2,
      },
    });
    await waitFor(() => {
      expect(screen.getByText(/Tournez à droite/)).toBeInTheDocument();
    });
    expect(mount).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
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
        mapEngine={stubMapEngine()}
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
        mapEngine={stubMapEngine()}
      />,
    );
    expect(screen.getByRole("button", { name: "Muet" })).toHaveClass("min-h-12");
    expect(screen.getByRole("button", { name: "Recentrer" })).toHaveClass(
      "min-h-12",
    );
    expect(screen.getByRole("button", { name: "Arrêter" })).toHaveClass(
      "min-h-12",
    );
    expect(screen.getByText(FOREGROUND_ONLY_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Navigation" }).parentElement).toBe(
      document.body,
    );
  });

  it("overlays the map with a maneuver banner and compact ETA sheet (FR-024)", () => {
    render(
      <NavigationSession
        route={route}
        request={request}
        onStop={() => {}}
        locationWatch={createWatch().watch}
        speech={stubSpeech()}
        mapEngine={stubMapEngine()}
        now={() => Date.UTC(2026, 7, 24, 16, 0, 0)}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Navigation" });
    expect(dialog).not.toHaveClass("flex-col");
    expect(
      screen.getByRole("banner", { name: "Prochaine manœuvre" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("contentinfo", { name: "Arrivée estimée" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2.0 km")).toBeInTheDocument();
    expect(screen.getByText("3 min")).toBeInTheDocument();
    expect(screen.getByText("GPS en attente")).toBeInTheDocument();
  });

  it("stops the GPS watch while the tab is hidden (NFR-006)", async () => {
    const helper = createWatch();
    render(
      <NavigationSession
        route={route}
        request={request}
        onStop={() => {}}
        locationWatch={helper.watch}
        speech={stubSpeech()}
        mapEngine={stubMapEngine()}
      />,
    );
    expect(helper.native).toBe(1);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => {
      expect(helper.native).toBe(0);
    });

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => {
      expect(helper.native).toBe(1);
    });
  });

  it("keeps the session up if a GPS tick throws (NFR-006)", async () => {
    const { watch, emit } = createWatch();
    const speech = stubSpeech();
    speech.speak.mockImplementation(() => {
      throw new Error("speech failed");
    });
    render(
      <NavigationSession
        route={route}
        request={request}
        onStop={() => {}}
        locationWatch={watch}
        speech={speech}
        mapEngine={stubMapEngine()}
      />,
    );

    emit({
      type: "fix",
      fix: {
        coordinates: { latitude: 45.4, longitude: -72.7 },
        accuracyMeters: 8,
        recordedAtMs: 1,
      },
    });
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Navigation" })).toBeInTheDocument();
    });
    emit({
      type: "fix",
      fix: {
        coordinates: { latitude: 45.4002, longitude: -72.6998 },
        accuracyMeters: 10,
        recordedAtMs: 2,
      },
    });
    expect(screen.getByRole("dialog", { name: "Navigation" })).toBeInTheDocument();
    expect(screen.getByText(/Tournez à droite/)).toBeInTheDocument();
  });

  it("does not call the network on ordinary GPS ticks (FR-026)", async () => {
    const { watch, emit } = createWatch();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const recalculate = vi.fn(async () => ({ ok: true as const, route }));
    render(
      <NavigationSession
        route={route}
        request={request}
        onStop={() => {}}
        locationWatch={watch}
        speech={stubSpeech()}
        recalculate={recalculate}
        mapEngine={stubMapEngine()}
      />,
    );
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
    expect(recalculate).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("can reuse an external street map instead of mounting a second one (FR-013, FR-023)", async () => {
    const { watch, emit } = createWatch();
    const onUserLocation = vi.fn();
    const onRecenter = vi.fn();
    const mount = vi.fn();
    render(
      <NavigationSession
        route={route}
        request={request}
        onStop={() => {}}
        locationWatch={watch}
        speech={stubSpeech()}
        mapEngine={{ mount }}
        renderMap={false}
        onUserLocation={onUserLocation}
        onRecenter={onRecenter}
      />,
    );

    expect(mount).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("region", { name: "Carte de navigation" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Navigation" })).not.toHaveClass(
      "flex-col",
    );

    emit({
      type: "fix",
      fix: {
        coordinates: { latitude: 45.4, longitude: -72.7 },
        accuracyMeters: 8,
        recordedAtMs: 1,
      },
    });
    await waitFor(() => {
      expect(onUserLocation).toHaveBeenCalledWith({
        latitude: 45.4,
        longitude: -72.7,
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Recentrer" }));
    expect(onRecenter).toHaveBeenCalledTimes(1);
  });

  it("holds the screen awake only while the session is mounted (FR-023, FR-027)", () => {
    const wakeLock = { acquire: vi.fn(), release: vi.fn() };
    const { unmount } = render(
      <NavigationSession
        route={route}
        request={request}
        onStop={() => {}}
        locationWatch={createWatch().watch}
        speech={stubSpeech()}
        mapEngine={stubMapEngine()}
        wakeLock={wakeLock}
      />,
    );
    expect(wakeLock.acquire).toHaveBeenCalledTimes(1);
    unmount();
    expect(wakeLock.release).toHaveBeenCalled();
  });
});
