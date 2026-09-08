import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { offsetCoordinates } from "@/domain/geo/distance";
import type { Position } from "@/domain/geo/types";
import { composeGpxRoute } from "@/domain/gpx/compose";
import type { LocationWatch, LocationWatchEvent } from "@/domain/location/types";
import { NAVIGATION_STATUS_MESSAGES } from "@/domain/navigation/status";
import type { GenerateRideRequest, GeneratedLoopRoute } from "@/domain/ride/types";
import type { CarPlayDisplay } from "@/infrastructure/carplay/carplay-display";
import type { CarPlayDisplayEvent } from "@/infrastructure/carplay/types";
import { MAP_THEME_STORAGE_KEY } from "@/domain/map/map-theme";
import { AppearanceProvider } from "@/components/theme/appearance-provider";
import {
  MapThemeProvider,
  useMapTheme,
} from "@/components/theme/map-theme-provider";
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

function stubAudioCues() {
  return {
    available: true,
    play: vi.fn(),
    setMuted: vi.fn(),
    unlock: vi.fn(),
    stop: vi.fn(),
    setVoice: vi.fn(),
  };
}

/** A device where speechSynthesis is missing, as on a locked-down browser. */
function stubSilentSpeech() {
  return {
    ...stubSpeech(),
    available: false,
    status: () => ({
      available: false,
      unlocked: false,
      hasSpoken: false,
      failed: false,
    }),
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

function stubCarPlay() {
  const listeners = new Set<(event: CarPlayDisplayEvent) => void>();
  const display: CarPlayDisplay = {
    start: vi.fn(async () => ({ connected: false, ownsVoice: false })),
    update: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    subscribe: vi.fn((listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
  };
  return {
    display,
    emit(event: CarPlayDisplayEvent) {
      for (const listener of listeners) {
        listener(event);
      }
    },
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

    fireEvent.click(screen.getAllByRole("button", { name: "Couper le guidage vocal" })[0]!);
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
    fireEvent.click(screen.getByRole("button", { name: "Terminer la navigation" }));
    fireEvent.click(screen.getByRole("button", { name: "Oui, terminer" }));
    expect(onStop).toHaveBeenCalled();
  });

  it("ignores GPS ticks and drops the watch after navigation is cancelled (FR-023, FR-038)", () => {
    const helper = createWatch();
    const speech = stubSpeech();
    const onStop = vi.fn();
    const { unmount } = render(
      <NavigationSession
        route={route}
        request={request}
        onStop={onStop}
        locationWatch={helper.watch}
        speech={speech}
        mapEngine={stubMapEngine()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Terminer la navigation" }));
    fireEvent.click(screen.getByRole("button", { name: "Oui, terminer" }));
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(speech.cancel).toHaveBeenCalled();

    helper.emit({
      type: "fix",
      fix: {
        coordinates: { latitude: 45.4, longitude: -72.7 },
        accuracyMeters: 8,
        recordedAtMs: 1,
      },
    });
    expect(speech.speak).not.toHaveBeenCalled();

    unmount();
    expect(helper.watch.activeNativeWatches()).toBe(0);
    helper.emit({
      type: "fix",
      fix: {
        coordinates: { latitude: 45.41, longitude: -72.71 },
        accuracyMeters: 8,
        recordedAtMs: 2,
      },
    });
    expect(speech.speak).not.toHaveBeenCalled();
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
    expect(screen.getAllByRole("button", { name: "Couper le guidage vocal" })[0]!).toHaveClass("min-h-12");
    expect(screen.getByRole("button", { name: "Recentrer sur ma position" })).toHaveClass(
      "min-h-12",
    );
    expect(screen.getByRole("button", { name: "Terminer la navigation" })).toHaveClass(
      "min-h-12",
    );
    
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
      screen.getByRole("contentinfo", { name: "Progression du trajet" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("2.0 km")).toBeInTheDocument();
    expect(screen.getByLabelText("3 min")).toBeInTheDocument();
    expect(screen.getByTestId("navigation-status")).toHaveTextContent(
      NAVIGATION_STATUS_MESSAGES.locating,
    );
    expect(
      screen.getByRole("banner", { name: "Prochaine manœuvre" }),
    ).not.toHaveTextContent("0 m");
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
      expect(onUserLocation).toHaveBeenCalledWith(
        {
          latitude: 45.4,
          longitude: -72.7,
        },
        expect.closeTo(90, 0),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Recentrer sur ma position" }));
    expect(onRecenter).toHaveBeenCalledTimes(1);
  });

  it("projects the shared map puck onto the route (FR-024)", async () => {
    const { watch, emit } = createWatch();
    const onUserLocation = vi.fn();
    render(
      <NavigationSession
        route={route}
        request={request}
        onStop={() => {}}
        locationWatch={watch}
        speech={stubSpeech()}
        mapEngine={{ mount: vi.fn() }}
        renderMap={false}
        onUserLocation={onUserLocation}
      />,
    );

    emit({
      type: "fix",
      fix: {
        coordinates: { latitude: 45.40018, longitude: -72.69 },
        accuracyMeters: 8,
        recordedAtMs: 1,
      },
    });

    await waitFor(() => {
      expect(onUserLocation).toHaveBeenCalled();
    });
    const [point, heading] = onUserLocation.mock.calls.at(-1)!;
    expect(point).toEqual(
      expect.objectContaining({
        longitude: expect.closeTo(-72.69, 4),
        latitude: expect.closeTo(45.4, 4),
      }),
    );
    expect(point).not.toEqual({
      latitude: 45.40018,
      longitude: -72.69,
    });
    expect(heading).toEqual(expect.closeTo(90, 0));
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

  it("starts the CarPlay display and stops it on unmount (FR-028)", async () => {
    const carPlay = stubCarPlay();
    const { unmount } = render(
      <NavigationSession
        route={route}
        request={request}
        onStop={() => {}}
        locationWatch={createWatch().watch}
        speech={stubSpeech()}
        mapEngine={stubMapEngine()}
        carPlay={carPlay.display}
      />,
    );

    await waitFor(() => {
      expect(carPlay.display.start).toHaveBeenCalledTimes(1);
    });
    expect(carPlay.display.start).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: "loop-1",
        cancelSpeech: false,
        coordinates: [
          { latitude: 45.4, longitude: -72.7 },
          { latitude: 45.4, longitude: -72.68 },
        ],
        muted: false,
      }),
    );
    unmount();
    expect(carPlay.display.stop).toHaveBeenCalled();
  });

  it("keeps the GPS watch while hidden if CarPlay is connected (FR-028, NFR-006)", async () => {
    const helper = createWatch();
    const carPlay = stubCarPlay();
    render(
      <NavigationSession
        route={route}
        request={request}
        onStop={() => {}}
        locationWatch={helper.watch}
        speech={stubSpeech()}
        mapEngine={stubMapEngine()}
        carPlay={carPlay.display}
      />,
    );
    await waitFor(() => {
      expect(carPlay.display.subscribe).toHaveBeenCalled();
    });
    carPlay.emit({ type: "connection", connected: true });
    expect(helper.native).toBe(1);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => {
      expect(screen.getByText("Navigation active sur CarPlay.")).toBeInTheDocument();
    });
    expect(helper.native).toBe(1);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  it("lets CarPlay own the voice so speechSynthesis does not double-announce (FR-025, FR-028)", async () => {
    const { watch, emit } = createWatch();
    const speech = stubSpeech();
    const carPlay = stubCarPlay();
    render(
      <NavigationSession
        route={route}
        request={request}
        onStop={() => {}}
        locationWatch={watch}
        speech={speech}
        mapEngine={stubMapEngine()}
        carPlay={carPlay.display}
      />,
    );
    await waitFor(() => {
      expect(carPlay.display.subscribe).toHaveBeenCalled();
    });
    carPlay.emit({ type: "connection", connected: true });

    emit({
      type: "fix",
      fix: {
        coordinates: { latitude: 45.4, longitude: -72.7 },
        accuracyMeters: 8,
        headingDeg: 90,
        recordedAtMs: 1,
      },
    });

    await waitFor(() => {
      expect(carPlay.display.update).toHaveBeenCalled();
    });
    expect(speech.speak).not.toHaveBeenCalled();
    expect(carPlay.display.update).toHaveBeenCalledWith(
      expect.objectContaining({
        headingDeg: 90,
        userLocation: { latitude: 45.4, longitude: -72.7 },
        maneuver: expect.objectContaining({
          maneuverType: "turn",
          modifier: "right",
        }),
      }),
    );
  });

  it("replays the current maneuver on CarPlay when the vehicle takes voice (FR-025, FR-028)", async () => {
    const { watch, emit } = createWatch();
    const speech = stubSpeech();
    const carPlay = stubCarPlay();
    render(
      <NavigationSession
        route={route}
        request={request}
        onStop={() => {}}
        locationWatch={watch}
        speech={speech}
        mapEngine={stubMapEngine()}
        carPlay={carPlay.display}
      />,
    );
    await waitFor(() => {
      expect(carPlay.display.subscribe).toHaveBeenCalled();
    });

    emit({
      type: "fix",
      fix: {
        coordinates: { latitude: 45.4, longitude: -72.683 },
        accuracyMeters: 8,
        recordedAtMs: 1,
      },
    });
    await waitFor(() => {
      expect(speech.speak).toHaveBeenCalled();
    });
    const spoken = speech.speak.mock.calls[0]?.[0];
    speech.speak.mockClear();
    carPlay.emit({ type: "connection", connected: true });

    expect(speech.cancel).toHaveBeenCalled();
    expect(speech.speak).not.toHaveBeenCalled();
    expect(carPlay.display.update).toHaveBeenCalledWith(
      expect.objectContaining({
        speakText: spoken,
      }),
    );

    vi.mocked(carPlay.display.update).mockClear();
    carPlay.emit({ type: "connection", connected: true });
    expect(
      vi.mocked(carPlay.display.update).mock.calls.filter(
        ([snapshot]) => snapshot.speakText,
      ),
    ).toHaveLength(0);
  });

  it("subscribes to CarPlay before starting so connection events are not missed (FR-028)", async () => {
    const order: string[] = [];
    const carPlay = stubCarPlay();
    const originalSubscribe = carPlay.display.subscribe;
    const originalStart = carPlay.display.start;
    carPlay.display.subscribe = vi.fn((listener) => {
      order.push("subscribe");
      return originalSubscribe(listener);
    });
    carPlay.display.start = vi.fn(async (snapshot) => {
      order.push("start");
      return originalStart(snapshot);
    });
    render(
      <NavigationSession
        route={route}
        request={request}
        onStop={() => {}}
        locationWatch={createWatch().watch}
        speech={stubSpeech()}
        mapEngine={stubMapEngine()}
        carPlay={carPlay.display}
      />,
    );
    await waitFor(() => {
      expect(order).toEqual(["subscribe", "start"]);
    });
  });

  it("applies CarPlay mute to the next GPS snapshot (FR-025, FR-028)", async () => {
    const { watch, emit } = createWatch();
    const carPlay = stubCarPlay();
    render(
      <NavigationSession
        route={route}
        request={request}
        onStop={() => {}}
        locationWatch={watch}
        speech={stubSpeech()}
        mapEngine={stubMapEngine()}
        carPlay={carPlay.display}
      />,
    );
    await waitFor(() => {
      expect(carPlay.display.subscribe).toHaveBeenCalled();
    });
    carPlay.emit({ type: "mute", muted: true });
    await waitFor(() => {
      expect(carPlay.display.update).toHaveBeenCalledWith(
        expect.objectContaining({ muted: true }),
      );
    });
    emit({
      type: "fix",
      fix: {
        coordinates: { latitude: 45.4, longitude: -72.7 },
        accuracyMeters: 8,
        recordedAtMs: 1,
      },
    });
    await waitFor(() => {
      expect(carPlay.display.update).toHaveBeenCalledWith(
        expect.objectContaining({ muted: true }),
      );
    });
  });

  it("cancels iPhone speech when CarPlay connects (FR-025, FR-028)", async () => {
    const speech = stubSpeech();
    const carPlay = stubCarPlay();
    render(
      <NavigationSession
        route={route}
        request={request}
        onStop={() => {}}
        locationWatch={createWatch().watch}
        speech={speech}
        mapEngine={stubMapEngine()}
        carPlay={carPlay.display}
      />,
    );
    await waitFor(() => {
      expect(carPlay.display.subscribe).toHaveBeenCalled();
    });
    speech.cancel.mockClear();
    carPlay.emit({ type: "connection", connected: true });
    expect(speech.cancel).toHaveBeenCalled();
  });

  it("stops navigation from CarPlay and ignores later GPS updates (FR-028)", async () => {
    const { watch, emit } = createWatch();
    const onStop = vi.fn();
    const carPlay = stubCarPlay();
    render(
      <NavigationSession
        route={route}
        request={request}
        onStop={onStop}
        locationWatch={watch}
        speech={stubSpeech()}
        mapEngine={stubMapEngine()}
        carPlay={carPlay.display}
      />,
    );
    await waitFor(() => {
      expect(carPlay.display.subscribe).toHaveBeenCalled();
    });
    carPlay.emit({ type: "stop" });
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(carPlay.display.stop).toHaveBeenCalled();
    const updatesAfterStop = vi.mocked(carPlay.display.update).mock.calls.length;
    emit({
      type: "fix",
      fix: {
        coordinates: { latitude: 45.4, longitude: -72.7 },
        accuracyMeters: 8,
        recordedAtMs: 1,
      },
    });
    expect(carPlay.display.update).toHaveBeenCalledTimes(updatesAfterStop);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("asks CarPlay to cancel speech when a recalculate starts (FR-026, FR-028)", async () => {
    const { watch, emit } = createWatch();
    const carPlay = stubCarPlay();
    let nowMs = 1_000;
    let finishRecalculate!: (value: { ok: true; route: typeof route }) => void;
    const recalculate = vi.fn(
      () =>
        new Promise<{ ok: true; route: typeof route }>((resolve) => {
          finishRecalculate = resolve;
        }),
    );
    render(
      <NavigationSession
        route={route}
        request={request}
        onStop={() => {}}
        locationWatch={watch}
        speech={stubSpeech()}
        recalculate={recalculate}
        mapEngine={stubMapEngine()}
        carPlay={carPlay.display}
        now={() => nowMs}
      />,
    );

    const offRouteFix = {
      type: "fix" as const,
      fix: {
        coordinates: { latitude: 45.5, longitude: -72.7 },
        accuracyMeters: 8,
        recordedAtMs: 1,
      },
    };
    emit(offRouteFix);
    nowMs = 2_000;
    emit(offRouteFix);
    nowMs = 3_000;
    emit(offRouteFix);
    nowMs = 9_000;
    emit(offRouteFix);

    await waitFor(() => {
      expect(recalculate).toHaveBeenCalled();
    });
    expect(carPlay.display.update).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: "loop-1",
        cancelSpeech: true,
        speakText: null,
      }),
    );

    finishRecalculate({
      ok: true,
      route: { ...route, id: "loop-2" },
    });
    await waitFor(() => {
      expect(carPlay.display.update).toHaveBeenCalledWith(
        expect.objectContaining({
          routeId: "loop-2",
          cancelSpeech: false,
        }),
      );
    });
  });
});

describe("NavigationSession GPX two-phase guidance (FR-039, BR-010)", () => {
  const origin = { latitude: 45.4, longitude: -72.7 };
  const east = { latitude: 45.4, longitude: -72.674 }; // ~2 km east
  const gpxRoute: import("@/domain/gpx/types").GeneratedGpxRoute = {
    id: "gpx-1",
    type: "gpx",
    source: "gpx",
    name: "Trace Est",
    start: { label: "Trace Est", coordinates: origin },
    destination: { label: "Arrivée GPX", coordinates: east },
    style: "touring",
    geometry: {
      type: "LineString",
      coordinates: [
        [origin.longitude, origin.latitude],
        [east.longitude, east.latitude],
      ],
    },
    parts: [
      {
        type: "LineString",
        coordinates: [
          [origin.longitude, origin.latitude],
          [east.longitude, east.latitude],
        ],
      },
    ],
    gapBeforeVertex: [],
    segments: [],
    steps: [
      {
        id: "gpx:depart",
        maneuverType: "depart",
        modifier: "straight",
        location: origin,
        distanceKm: 2,
        durationMinutes: 4,
        geometry: {
          type: "LineString",
          coordinates: [
            [origin.longitude, origin.latitude],
            [east.longitude, east.latitude],
          ],
        },
      },
      {
        id: "gpx:arrive",
        maneuverType: "arrive",
        modifier: "straight",
        location: east,
        distanceKm: 0,
        durationMinutes: 0,
        geometry: {
          type: "LineString",
          coordinates: [
            [origin.longitude, origin.latitude],
            [east.longitude, east.latitude],
          ],
        },
      },
    ],
    distanceKm: 2,
    durationMinutes: 4,
    warnings: [],
    isClosedLoop: false,
    trackKind: "track",
    originalGeometry: {
      type: "LineString",
      coordinates: [
        [origin.longitude, origin.latitude],
        [east.longitude, east.latitude],
      ],
    },
    originalParts: [
      {
        type: "LineString",
        coordinates: [
          [origin.longitude, origin.latitude],
          [east.longitude, east.latitude],
        ],
      },
    ],
  };

  const gpxRequest: GenerateRideRequest = {
    type: "gpx",
    start: gpxRoute.start,
    destination: gpxRoute.destination,
    name: gpxRoute.name,
    style: "touring",
    preferences: { avoidHighways: false, avoidUnpaved: false },
  };

  function connectorResult(start: { latitude: number; longitude: number }, dest: { latitude: number; longitude: number }) {
    const coordinates: Position[] = [
      [start.longitude, start.latitude],
      [dest.longitude, dest.latitude],
    ];
    return {
      ok: true as const,
      route: {
        geometry: {
          type: "LineString" as const,
          coordinates,
        },
        segments: [],
        steps: [
          {
            id: "join:1",
            maneuverType: "continue" as const,
            modifier: "straight" as const,
            location: dest,
            distanceKm: 1,
            durationMinutes: 2,
            geometry: {
              type: "LineString" as const,
              coordinates,
            },
          },
        ],
        distanceKm: 1,
        durationMinutes: 2,
      },
    };
  }

  it("joins from GPS then follows the imported GPX without replacing it", async () => {
    const { watch, emit } = createWatch();
    const onRouteChange = vi.fn();
    const joinRoute = vi.fn(async (input: { start: { latitude: number; longitude: number }; destination: { latitude: number; longitude: number } }) =>
      connectorResult(input.start, input.destination),
    );
    const south = { latitude: 45.385, longitude: -72.7 };
    render(
      <NavigationSession
        route={gpxRoute}
        request={gpxRequest}
        onStop={() => {}}
        onRouteChange={onRouteChange}
        locationWatch={watch}
        speech={stubSpeech()}
        joinRoute={joinRoute}
        recalculate={async () => ({ ok: true, route: gpxRoute })}
        mapEngine={stubMapEngine()}
      />,
    );

    emit({
      type: "fix",
      fix: { coordinates: south, accuracyMeters: 8, recordedAtMs: 1 },
    });
    await waitFor(() => {
      expect(joinRoute).toHaveBeenCalled();
    });
    expect(joinRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        preferences: gpxRequest.preferences,
      }),
      expect.any(AbortSignal),
    );
    await waitFor(() => {
      expect(screen.getAllByText("Rejoindre le trajet GPX").length).toBeGreaterThan(0);
    });
    expect(onRouteChange).not.toHaveBeenCalled();

    emit({
      type: "fix",
      fix: { coordinates: origin, accuracyMeters: 6, recordedAtMs: 2 },
    });
    await waitFor(() => {
      expect(screen.getAllByText("Trajet GPX").length).toBeGreaterThan(0);
    });
    expect(onRouteChange).not.toHaveBeenCalled();
  });

  it("ignores a delayed GPX join after the rider is already following the imported trace (FR-039, BR-010)", async () => {
    const { watch, emit } = createWatch();
    const onRouteChange = vi.fn();
    const onGpxOverlayChange = vi.fn();
    let resolveJoin: (() => void) | undefined;
    const joinRoute = vi.fn(
      (input: {
        start: { latitude: number; longitude: number };
        destination: { latitude: number; longitude: number };
      }) =>
        new Promise<ReturnType<typeof connectorResult>>((resolve) => {
          resolveJoin = () => resolve(connectorResult(input.start, input.destination));
        }),
    );
    const south = { latitude: 45.385, longitude: -72.7 };
    render(
      <NavigationSession
        route={gpxRoute}
        request={gpxRequest}
        onStop={() => {}}
        onRouteChange={onRouteChange}
        onGpxOverlayChange={onGpxOverlayChange}
        locationWatch={watch}
        speech={stubSpeech()}
        joinRoute={joinRoute}
        recalculate={async () => ({ ok: true, route: gpxRoute })}
        mapEngine={stubMapEngine()}
      />,
    );

    emit({
      type: "fix",
      fix: { coordinates: south, accuracyMeters: 8, recordedAtMs: 1 },
    });
    await waitFor(() => {
      expect(joinRoute).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getAllByText("Rejoindre le trajet GPX").length).toBeGreaterThan(0);
    });

    emit({
      type: "fix",
      fix: { coordinates: origin, accuracyMeters: 6, recordedAtMs: 2 },
    });
    await waitFor(() => {
      expect(screen.getAllByText("Trajet GPX").length).toBeGreaterThan(0);
    });
    expect(onRouteChange).not.toHaveBeenCalled();

    expect(resolveJoin).toBeDefined();
    await act(async () => {
      resolveJoin!();
    });
    expect(screen.queryAllByText("Rejoindre le trajet GPX")).toHaveLength(0);
    expect(screen.getAllByText("Trajet GPX").length).toBeGreaterThan(0);
    expect(onRouteChange).not.toHaveBeenCalled();
    const overlayPhases = onGpxOverlayChange.mock.calls.map(
      (call) => call[0]?.phase ?? null,
    );
    expect(overlayPhases.at(-1)).toBe("following_gpx");
    expect(overlayPhases.includes("joining_gpx")).toBe(true);
    expect(overlayPhases.lastIndexOf("joining_gpx")).toBeLessThan(
      overlayPhases.lastIndexOf("following_gpx"),
    );
    const lastOverlay = onGpxOverlayChange.mock.calls.at(-1)?.[0];
    expect(lastOverlay?.connectorGeometry).toBeNull();
  });

  it("skips the join when the rider is already on the GPX", async () => {
    const { watch, emit } = createWatch();
    const joinRoute = vi.fn(async () => connectorResult(origin, origin));
    render(
      <NavigationSession
        route={gpxRoute}
        request={gpxRequest}
        onStop={() => {}}
        locationWatch={watch}
        speech={stubSpeech()}
        joinRoute={joinRoute}
        mapEngine={stubMapEngine()}
      />,
    );
    emit({
      type: "fix",
      fix: { coordinates: origin, accuracyMeters: 5, recordedAtMs: 1 },
    });
    await waitFor(() => {
      expect(screen.getAllByText("Trajet GPX").length).toBeGreaterThan(0);
    });
    expect(joinRoute).not.toHaveBeenCalled();
  });

  it("does not jump remaining GPX at a self-crossing while following (FR-039)", async () => {
    const { watch, emit } = createWatch();
    const joinRoute = vi.fn(async () => connectorResult(origin, origin));
    const north = offsetCoordinates(origin, 0, 0.4);
    const east = offsetCoordinates(origin, 90, 0.4);
    const south = offsetCoordinates(origin, 180, 0.4);
    const west = offsetCoordinates(origin, 270, 0.4);
    const crossingRoute = composeGpxRoute({
      trip: {
        id: "cross",
        kind: "track",
        name: "Croisement",
        parts: [
          {
            points: [north, south, east, west].map((coordinates) => ({
              coordinates,
            })),
          },
        ],
      },
      fileName: "cross.gpx",
    });
    render(
      <NavigationSession
        route={crossingRoute}
        request={{
          type: "gpx",
          start: crossingRoute.start,
          destination: crossingRoute.destination,
          name: crossingRoute.name,
          style: "touring",
          preferences: { avoidHighways: false, avoidUnpaved: false },
        }}
        onStop={() => {}}
        locationWatch={watch}
        speech={stubSpeech()}
        joinRoute={joinRoute}
        mapEngine={stubMapEngine()}
      />,
    );
    emit({
      type: "fix",
      fix: {
        coordinates: north,
        accuracyMeters: 5,
        headingDeg: 180,
        recordedAtMs: 1,
      },
    });
    await waitFor(() => {
      expect(screen.getAllByText("Trajet GPX").length).toBeGreaterThan(0);
    });
    emit({
      type: "fix",
      fix: {
        coordinates: origin,
        accuracyMeters: 5,
        headingDeg: 270,
        recordedAtMs: 2,
      },
    });
    await waitFor(() => {
      const remaining = screen.getByText("distance").previousElementSibling;
      expect(remaining?.textContent).toMatch(/km$/);
      expect(Number.parseFloat(remaining?.textContent ?? "0")).toBeGreaterThan(
        1.5,
      );
    });
    expect(joinRoute).not.toHaveBeenCalled();
  });

  it("keeps the GPX when the join engine fails", async () => {
    const { watch, emit } = createWatch();
    const joinRoute = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: "PROVIDER_ERROR" as const,
        message: "Le raccordement vers le trajet GPX a échoué. Le tracé importé reste affiché.",
        suggestions: ["Réessayez."],
      },
    }));
    render(
      <NavigationSession
        route={gpxRoute}
        request={gpxRequest}
        onStop={() => {}}
        locationWatch={watch}
        speech={stubSpeech()}
        joinRoute={joinRoute}
        mapEngine={stubMapEngine()}
      />,
    );
    emit({
      type: "fix",
      fix: {
        coordinates: { latitude: 45.385, longitude: -72.7 },
        accuracyMeters: 8,
        recordedAtMs: 1,
      },
    });
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/raccordement/i);
    });
    expect(screen.getByRole("dialog", { name: "Navigation" })).toBeInTheDocument();
  });

  it("cancels during joining and stops voice plus in-flight requests", async () => {
    const { watch, emit } = createWatch();
    const onStop = vi.fn();
    const speech = stubSpeech();
    let abortSeen = false;
    const joinRoute = vi.fn(
      async (
        _input: unknown,
        signal?: AbortSignal,
      ) => {
        try {
          await new Promise<void>((resolve, reject) => {
            signal?.addEventListener("abort", () => {
              abortSeen = true;
              reject(new DOMException("Aborted", "AbortError"));
            });
          });
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return {
              ok: false as const,
              error: {
                code: "STALE_RECALCULATE" as const,
                message: "Ce raccordement n’est plus d’actualité.",
                suggestions: [],
              },
            };
          }
          throw error;
        }
        return connectorResult(origin, origin);
      },
    );
    render(
      <NavigationSession
        route={gpxRoute}
        request={gpxRequest}
        onStop={onStop}
        locationWatch={watch}
        speech={speech}
        joinRoute={joinRoute}
        mapEngine={stubMapEngine()}
      />,
    );
    emit({
      type: "fix",
      fix: {
        coordinates: { latitude: 45.385, longitude: -72.7 },
        accuracyMeters: 8,
        recordedAtMs: 1,
      },
    });
    await waitFor(() => {
      expect(joinRoute).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Terminer la navigation" }));
    fireEvent.click(screen.getByRole("button", { name: "Oui, terminer" }));
    expect(onStop).toHaveBeenCalled();
    expect(speech.cancel).toHaveBeenCalled();
    await waitFor(() => {
      expect(abortSeen).toBe(true);
    });
  });

  it("rejoins ahead after a confirmed GPX departure", async () => {
    const { watch, emit } = createWatch();
    let nowMs = 1_000_000;
    const joinRoute = vi.fn(async (input: { start: { latitude: number; longitude: number }; destination: { latitude: number; longitude: number } }) =>
      connectorResult(input.start, input.destination),
    );
    render(
      <NavigationSession
        route={gpxRoute}
        request={gpxRequest}
        onStop={() => {}}
        locationWatch={watch}
        speech={stubSpeech()}
        joinRoute={joinRoute}
        now={() => nowMs}
        mapEngine={stubMapEngine()}
      />,
    );
    emit({
      type: "fix",
      fix: { coordinates: origin, accuracyMeters: 5, recordedAtMs: nowMs },
    });
    await waitFor(() => {
      expect(screen.getAllByText("Trajet GPX").length).toBeGreaterThan(0);
    });
    joinRoute.mockClear();
    const farNorth = { latitude: 45.42, longitude: -72.69 };
    for (let index = 0; index < 4; index += 1) {
      nowMs += 4_000;
      emit({
        type: "fix",
        fix: {
          coordinates: farNorth,
          accuracyMeters: 8,
          recordedAtMs: nowMs,
        },
      });
    }
    await waitFor(() => {
      expect(joinRoute).toHaveBeenCalled();
    });
    const dest = joinRoute.mock.calls[0]?.[0]?.destination;
    expect(dest).toBeDefined();
    expect(dest!.longitude).toBeGreaterThan(origin.longitude);
    await waitFor(() => {
      expect(screen.getAllByText("Hors trajet").length).toBeGreaterThan(0);
    });
  });

  it("reads remaining after mid-trace progress then off-route rejoin (FR-039)", async () => {
    const { watch, emit } = createWatch();
    let nowMs = 1_000_000;
    const joinRoute = vi.fn(async (input: { start: { latitude: number; longitude: number }; destination: { latitude: number; longitude: number } }) =>
      connectorResult(input.start, input.destination),
    );
    render(
      <NavigationSession
        route={gpxRoute}
        request={gpxRequest}
        onStop={() => {}}
        locationWatch={watch}
        speech={stubSpeech()}
        joinRoute={joinRoute}
        now={() => nowMs}
        mapEngine={stubMapEngine()}
      />,
    );
    emit({
      type: "fix",
      fix: {
        coordinates: origin,
        accuracyMeters: 5,
        headingDeg: 90,
        recordedAtMs: nowMs,
      },
    });
    await waitFor(() => {
      expect(screen.getAllByText("Trajet GPX").length).toBeGreaterThan(0);
    });
    expect(joinRoute).not.toHaveBeenCalled();

    const mid = offsetCoordinates(origin, 90, 1);
    nowMs += 2_000;
    emit({
      type: "fix",
      fix: {
        coordinates: mid,
        accuracyMeters: 5,
        headingDeg: 90,
        recordedAtMs: nowMs,
      },
    });

    let followingRemainingKm = Number.NaN;
    let followingRemainingMin = Number.NaN;
    await waitFor(() => {
      followingRemainingKm = Number.parseFloat(
        screen.getByText("distance").previousElementSibling?.textContent ?? "",
      );
      followingRemainingMin = Number.parseFloat(
        screen.getByText("restant").previousElementSibling?.textContent ?? "",
      );
      expect(followingRemainingKm).toBeGreaterThan(0.4);
      expect(followingRemainingKm).toBeLessThan(1.6);
    });

    joinRoute.mockClear();
    const farNorth = { latitude: 45.42, longitude: -72.69 };
    for (let index = 0; index < 4; index += 1) {
      nowMs += 4_000;
      emit({
        type: "fix",
        fix: {
          coordinates: farNorth,
          accuracyMeters: 8,
          recordedAtMs: nowMs,
        },
      });
    }
    await waitFor(() => {
      expect(joinRoute).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getAllByText("Hors trajet").length).toBeGreaterThan(0);
    });
    const pendingJoin = joinRoute.mock.results.at(-1)?.value as Promise<unknown>;
    await act(async () => {
      await pendingJoin;
    });

    nowMs += 1_000;
    emit({
      type: "fix",
      fix: {
        coordinates: farNorth,
        accuracyMeters: 8,
        recordedAtMs: nowMs,
      },
    });

    await waitFor(() => {
      const joiningRemainingKm = Number.parseFloat(
        screen.getByText("distance").previousElementSibling?.textContent ?? "",
      );
      const joiningRemainingMin = Number.parseFloat(
        screen.getByText("restant").previousElementSibling?.textContent ?? "",
      );
      const connectorKm = 1;
      const connectorMin = 2;
      expect(joiningRemainingKm).toBeGreaterThan(connectorKm);
      expect(joiningRemainingMin).toBeGreaterThan(connectorMin);
      // Connector + GPX still ahead after mid-trace, not connector + full follow (~3 km / 6 min).
      expect(joiningRemainingKm).toBeLessThan(gpxRoute.distanceKm + connectorKm - 0.2);
      expect(joiningRemainingMin).toBeLessThan(gpxRoute.durationMinutes + connectorMin - 0.5);
      expect(joiningRemainingKm).toBeCloseTo(followingRemainingKm + connectorKm, 0);
      expect(joiningRemainingMin).toBeCloseTo(followingRemainingMin + connectorMin, 0);
    });
  });

  it("keeps exactly one GPS watch across visibility flips and releases it on stop (NFR-006)", () => {
    const helper = createWatch();
    const subscribeSpy = vi.spyOn(helper.watch, "subscribe");
    const { unmount } = render(
      <NavigationSession
        route={route}
        request={request}
        onStop={() => {}}
        locationWatch={helper.watch}
        speech={stubSpeech()}
        mapEngine={stubMapEngine()}
      />,
    );

    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    expect(helper.native).toBe(1);

    // Backgrounding drops the watch; returning re-subscribes exactly once.
    act(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(helper.native).toBe(0);

    act(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(subscribeSpy).toHaveBeenCalledTimes(2);
    expect(helper.native).toBe(1);

    unmount();
    expect(helper.native).toBe(0);
  });

  it("names a weak GPS signal without dropping the route (FR-042)", async () => {
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

    act(() => {
      helper.emit({
        type: "fix",
        fix: {
          coordinates: { latitude: 45.4, longitude: -72.7 },
          accuracyMeters: 400,
          recordedAtMs: 1,
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("navigation-status")).toHaveTextContent(
        NAVIGATION_STATUS_MESSAGES.weakGps,
      );
    });
    expect(
      screen.getByRole("contentinfo", { name: "Progression du trajet" }),
    ).toBeInTheDocument();
  });

  it("recovers the status once a precise fix comes back (FR-042)", async () => {
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

    act(() => {
      helper.emit({
        type: "error",
        error: { code: "POSITION_UNAVAILABLE", message: "perdu" },
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId("navigation-status")).toHaveTextContent(
        NAVIGATION_STATUS_MESSAGES.gpsLost,
      );
    });

    act(() => {
      helper.emit({
        type: "fix",
        fix: {
          coordinates: { latitude: 45.4, longitude: -72.7 },
          accuracyMeters: 8,
          recordedAtMs: 2,
        },
      });
    });
    await waitFor(() => {
      expect(screen.queryByTestId("navigation-status")).not.toBeInTheDocument();
    });
  });

  it("promotes the recentre control when the host reports a manual pan (FR-042)", () => {
    const helper = createWatch();
    const onRecenter = vi.fn();
    const { rerender } = render(
      <NavigationSession
        route={route}
        request={request}
        onStop={() => {}}
        onRecenter={onRecenter}
        renderMap={false}
        followingUser
        locationWatch={helper.watch}
        speech={stubSpeech()}
      />,
    );
    expect(screen.queryByTestId("recenter-prominent")).not.toBeInTheDocument();

    rerender(
      <NavigationSession
        route={route}
        request={request}
        onStop={() => {}}
        onRecenter={onRecenter}
        renderMap={false}
        followingUser={false}
        locationWatch={helper.watch}
        speech={stubSpeech()}
      />,
    );

    fireEvent.click(screen.getByTestId("recenter-prominent"));
    expect(onRecenter).toHaveBeenCalledTimes(1);
  });

  it("reports the ridden distance so the host map can dim it (FR-042)", async () => {
    const helper = createWatch();
    const onProgressKm = vi.fn();
    render(
      <NavigationSession
        route={route}
        request={request}
        onStop={() => {}}
        onProgressKm={onProgressKm}
        renderMap={false}
        locationWatch={helper.watch}
        speech={stubSpeech()}
      />,
    );

    act(() => {
      helper.emit({
        type: "fix",
        fix: {
          coordinates: { latitude: 45.4, longitude: -72.69 },
          accuracyMeters: 8,
          recordedAtMs: 1,
        },
      });
    });

    await waitFor(() => {
      expect(onProgressKm).toHaveBeenCalled();
    });
    expect(onProgressKm.mock.calls.at(-1)?.[0]).toBeGreaterThan(0);
  });
  it("plays a maneuver earcon when the voice cannot be heard (FR-044)", async () => {
    const { watch, emit } = createWatch();
    const audioCues = stubAudioCues();
    render(
      <NavigationSession
        route={route}
        request={request}
        onStop={() => {}}
        locationWatch={watch}
        speech={stubSilentSpeech()}
        audioCues={audioCues}
        mapEngine={stubMapEngine()}
      />,
    );

    emit({
      type: "fix",
      fix: {
        coordinates: { latitude: 45.4, longitude: -72.683 },
        accuracyMeters: 8,
        recordedAtMs: 1,
      },
    });

    await waitFor(() => {
      expect(audioCues.play).toHaveBeenCalled();
    });
    expect(["prepare", "approach", "imminent"]).toContain(
      audioCues.play.mock.calls[0]?.[0],
    );
  });

  it("stays on the voice, without earcons, when speech works (FR-025)", async () => {
    const { watch, emit } = createWatch();
    const audioCues = stubAudioCues();
    const speech = stubSpeech();
    render(
      <NavigationSession
        route={route}
        request={request}
        onStop={() => {}}
        locationWatch={watch}
        speech={speech}
        audioCues={audioCues}
        mapEngine={stubMapEngine()}
      />,
    );

    emit({
      type: "fix",
      fix: {
        coordinates: { latitude: 45.4, longitude: -72.683 },
        accuracyMeters: 8,
        recordedAtMs: 1,
      },
    });

    await waitFor(() => {
      expect(speech.speak).toHaveBeenCalled();
    });
    expect(audioCues.play).not.toHaveBeenCalled();
  });

  it("mutes the earcons with the voice, and cuts them on stop (FR-044)", async () => {
    const { watch, emit } = createWatch();
    const audioCues = stubAudioCues();
    window.localStorage.setItem(MAP_THEME_STORAGE_KEY, "auto");
    render(
      <AppearanceProvider>
        <MapThemeProvider>
          <NavigationSession
            route={route}
            request={request}
            onStop={() => {}}
            locationWatch={watch}
            speech={stubSilentSpeech()}
            audioCues={audioCues}
            mapEngine={stubMapEngine()}
          />
        </MapThemeProvider>
      </AppearanceProvider>,
    );

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Guidage vocal indisponible — sons de manœuvre actifs",
      })[0]!,
    );
    emit({
      type: "fix",
      fix: {
        coordinates: { latitude: 45.4, longitude: -72.683 },
        accuracyMeters: 8,
        recordedAtMs: 1,
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/Tournez à droite/)).toBeInTheDocument();
    });
    expect(audioCues.play).not.toHaveBeenCalled();
    expect(audioCues.setMuted).toHaveBeenCalledWith(true);

    fireEvent.click(
      screen.getByRole("button", { name: "Terminer la navigation" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Oui, terminer" }));
    expect(audioCues.stop).toHaveBeenCalled();
  });

  it("plays the arrival earcon once (FR-044)", async () => {
    const { watch, emit } = createWatch();
    const audioCues = stubAudioCues();
    // The fixture geometry is ~1.56 km: a shorter total is fully ridden.
    const shortRoute = { ...route, distanceKm: 1.5 };
    render(
      <NavigationSession
        route={shortRoute}
        request={request}
        onStop={() => {}}
        locationWatch={watch}
        speech={stubSilentSpeech()}
        audioCues={audioCues}
        mapEngine={stubMapEngine()}
      />,
    );

    for (const recordedAtMs of [1, 2]) {
      emit({
        type: "fix",
        fix: {
          coordinates: { latitude: 45.4, longitude: -72.68 },
          accuracyMeters: 8,
          recordedAtMs,
        },
      });
    }

    await waitFor(() => {
      expect(audioCues.play).toHaveBeenCalledWith("arrival");
    });
    expect(
      audioCues.play.mock.calls.filter(([cue]) => cue === "arrival"),
    ).toHaveLength(1);
  });

  it("resumes the speech queue when the app returns to the foreground (FR-025)", async () => {
    const helper = createWatch();
    const speech = stubSpeech();
    render(
      <NavigationSession
        route={route}
        request={request}
        onStop={() => {}}
        locationWatch={helper.watch}
        speech={speech}
        mapEngine={stubMapEngine()}
      />,
    );

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => {
      expect(speech.cancel).toHaveBeenCalled();
    });
    expect(speech.unlock).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    // iOS leaves the queue paused after a screen lock (FR-025).
    await waitFor(() => {
      expect(speech.unlock).toHaveBeenCalled();
    });
  });
});

/** Lets a test flip the basemap the way Réglages does, mid-session. */
function ThemeSwitch() {
  const { setTheme } = useMapTheme();
  return (
    <button type="button" onClick={() => setTheme("kart-arcade")}>
      Kart Arcade
    </button>
  );
}

describe("NavigationSession — Kart Arcade (FR-046)", () => {
  afterEach(() => {
    window.localStorage.removeItem(MAP_THEME_STORAGE_KEY);
  });

  function renderArcadeSession(
    props: Partial<ComponentProps<typeof NavigationSession>> = {},
  ) {
    window.localStorage.setItem(MAP_THEME_STORAGE_KEY, "kart-arcade");
    const { watch, emit } = createWatch();
    const audioCues = stubAudioCues();
    render(
      <AppearanceProvider>
        <MapThemeProvider>
          <NavigationSession
            route={route}
            request={request}
            onStop={() => {}}
            locationWatch={watch}
            speech={stubSpeech()}
            audioCues={audioCues}
            mapEngine={stubMapEngine()}
            {...props}
          />
        </MapThemeProvider>
      </AppearanceProvider>,
    );
    return { audioCues, emit };
  }

  const firstFix = {
    type: "fix" as const,
    fix: {
      coordinates: { latitude: 45.4, longitude: -72.683 },
      accuracyMeters: 8,
      recordedAtMs: 1,
    },
  };

  it("hands the arcade timbre to the running engine (FR-044)", async () => {
    const { audioCues } = renderArcadeSession();

    await waitFor(() => {
      expect(audioCues.setVoice).toHaveBeenCalledWith("arcade");
    });
  });

  it("settles on the standard timbre under every other basemap", async () => {
    const { watch } = createWatch();
    const audioCues = stubAudioCues();
    window.localStorage.setItem(MAP_THEME_STORAGE_KEY, "auto");
    render(
      <AppearanceProvider>
        <MapThemeProvider>
          <NavigationSession
            route={route}
            request={request}
            onStop={() => {}}
            locationWatch={watch}
            speech={stubSpeech()}
            audioCues={audioCues}
            mapEngine={stubMapEngine()}
          />
        </MapThemeProvider>
      </AppearanceProvider>,
    );

    await waitFor(() => {
      expect(audioCues.setVoice).toHaveBeenLastCalledWith("standard");
    });
  });

  it("counts down from three on the first GPS fix", async () => {
    const { audioCues, emit } = renderArcadeSession();
    // Nothing before the fix: a countdown started at mount would run out while
    // the screen still reads "Recherche de la position…".
    expect(screen.queryByTestId("arcade-countdown")).toBeNull();

    act(() => {
      emit(firstFix);
    });

    const stage = await screen.findByTestId("arcade-countdown");
    expect(stage.textContent).toBe("3");
    await waitFor(() => {
      expect(audioCues.play).toHaveBeenCalledWith("countdown");
    });
  });

  it("runs once, however many fixes arrive", async () => {
    // `hasFix` is set on every fix, so only the session's own guard stops the
    // countdown restarting for the whole ride.
    const { audioCues, emit } = renderArcadeSession();

    act(() => {
      emit(firstFix);
    });
    await screen.findByTestId("arcade-countdown");
    const afterFirst = audioCues.play.mock.calls.filter(
      (call) => call[0] === "countdown",
    ).length;

    act(() => {
      emit({
        type: "fix",
        fix: {
          coordinates: { latitude: 45.401, longitude: -72.682 },
          accuracyMeters: 8,
          recordedAtMs: 2,
        },
      });
    });

    expect(
      audioCues.play.mock.calls.filter((call) => call[0] === "countdown").length,
    ).toBe(afterFirst);
  });

  it("never starts a countdown when the theme is picked mid-ride", async () => {
    // Switching to Kart Arcade forty kilometres in must not announce a start
    // that already happened: the first fix spends the countdown whatever the
    // basemap was at the time.
    const { watch, emit } = createWatch();
    const audioCues = stubAudioCues();
    window.localStorage.setItem(MAP_THEME_STORAGE_KEY, "auto");
    render(
      <AppearanceProvider>
        <MapThemeProvider>
          <ThemeSwitch />
          <NavigationSession
            route={route}
            request={request}
            onStop={() => {}}
            locationWatch={watch}
            speech={stubSpeech()}
            audioCues={audioCues}
            mapEngine={stubMapEngine()}
          />
        </MapThemeProvider>
      </AppearanceProvider>,
    );

    act(() => {
      emit(firstFix);
    });
    expect(screen.queryByTestId("arcade-countdown")).toBeNull();

    act(() => {
      screen.getByRole("button", { name: "Kart Arcade" }).click();
    });

    await waitFor(() => {
      expect(audioCues.setVoice).toHaveBeenCalledWith("arcade");
    });
    // The timbre followed the theme; the countdown did not come back.
    expect(screen.queryByTestId("arcade-countdown")).toBeNull();
    expect(audioCues.play).not.toHaveBeenCalledWith("countdown");
  });

  it("stays silent while a vehicle screen owns the audio (FR-028)", async () => {
    const carPlay = stubCarPlay();
    const { audioCues, emit } = renderArcadeSession({ carPlay: carPlay.display });

    await waitFor(() => {
      expect(carPlay.display.subscribe).toHaveBeenCalled();
    });
    act(() => {
      carPlay.emit({ type: "connection", connected: true });
    });
    act(() => {
      emit(firstFix);
    });

    // The countdown is still drawn on the phone; only its sound stands down.
    await screen.findByTestId("arcade-countdown");
    expect(audioCues.play).not.toHaveBeenCalledWith("countdown");
  });
});
