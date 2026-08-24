import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LocationWatch, LocationWatchEvent } from "@/domain/location/types";
import { FOREGROUND_ONLY_MESSAGE } from "@/domain/navigation/session-copy";
import type { GenerateRideRequest, GeneratedLoopRoute } from "@/domain/ride/types";
import type { CarPlayDisplay } from "@/infrastructure/carplay/carplay-display";
import type { CarPlayDisplayEvent } from "@/infrastructure/carplay/types";
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
    fireEvent.click(screen.getByRole("button", { name: "Terminer" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Recentrer" }));
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
