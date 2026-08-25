import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { offsetCoordinates } from "@/domain/geo/distance";
import type { Position } from "@/domain/geo/types";
import { composeGpxRoute } from "@/domain/gpx/compose";
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
    fireEvent.click(screen.getByRole("button", { name: "Annuler la navigation" }));
    fireEvent.click(screen.getByRole("button", { name: "Oui, annuler" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Annuler la navigation" }));
    fireEvent.click(screen.getByRole("button", { name: "Oui, annuler" }));
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
    expect(screen.getByRole("button", { name: "Muet" })).toHaveClass("min-h-12");
    expect(screen.getByRole("button", { name: "Recentrer" })).toHaveClass(
      "min-h-12",
    );
    expect(screen.getByRole("button", { name: "Annuler la navigation" })).toHaveClass(
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
    fireEvent.click(screen.getByRole("button", { name: "Annuler la navigation" }));
    fireEvent.click(screen.getByRole("button", { name: "Oui, annuler" }));
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
      expect(joiningRemainingKm).toBeGreaterThan(0);
      expect(joiningRemainingMin).toBeGreaterThan(0);
      expect({
        followingRemainingKm,
        followingRemainingMin,
        joiningRemainingKm,
        joiningRemainingMin,
        connectorKm: 1,
        connectorMin: 2,
      }).toEqual(
        expect.objectContaining({
          followingRemainingKm: expect.any(Number),
          joiningRemainingKm: expect.any(Number),
        }),
      );
    });
  });
});
