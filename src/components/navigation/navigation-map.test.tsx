import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GeneratedLoopRoute } from "@/domain/ride/types";
import { mapThemeOverlay } from "@/components/map/map-theme-overlay";
import { mapThemeStyle } from "@/components/map/map-theme-styles";
import type { NavigationMapEngine } from "@/components/map/navigation-map-engine";
import { AppearanceProvider } from "@/components/theme/appearance-provider";
import {
  MapThemeProvider,
  useMapTheme,
} from "@/components/theme/map-theme-provider";
import { NavigationMap } from "./navigation-map";

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
  distanceKm: 2,
  durationMinutes: 3,
  statistics: { repeatedRoadPercent: 0 },
  warnings: [],
};

describe("NavigationMap (FR-023, FR-026, NFR-006)", () => {
  it("updates the route in place instead of remounting (FR-026)", () => {
    const destroy = vi.fn();
    const setViewModel = vi.fn();
    const mount = vi.fn(() => ({
      destroy,
      setUserLocation: vi.fn(),
      setFollowUser: vi.fn(),
      recenter: vi.fn(),
      setViewModel,
    }));
    const engine: NavigationMapEngine = { mount };

    const { rerender } = render(
      <NavigationMap route={route} engine={engine} />,
    );
    expect(mount).toHaveBeenCalledTimes(1);

    rerender(
      <NavigationMap
        route={{
          ...route,
          id: "loop-2",
          geometry: {
            type: "LineString",
            coordinates: [
              [-72.7, 45.4],
              [-72.6, 45.41],
            ],
          },
        }}
        engine={engine}
      />,
    );

    expect(mount).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
    expect(setViewModel).toHaveBeenCalled();
  });
});

describe("NavigationMap Kart Arcade (FR-046)", () => {
  function ArcadePicker() {
    const { setTheme } = useMapTheme();
    return (
      <button type="button" onClick={() => setTheme("kart-arcade")}>
        Kart Arcade
      </button>
    );
  }

  afterEach(() => {
    window.localStorage.clear();
  });

  it("mounts a live session with the navigation detail level", () => {
    const mount = vi.fn<NavigationMapEngine["mount"]>(() => ({
      destroy: vi.fn(),
      setUserLocation: vi.fn(),
      setFollowUser: vi.fn(),
      recenter: vi.fn(),
      setViewModel: vi.fn(),
    }));

    render(<NavigationMap route={route} engine={{ mount } as NavigationMapEngine} />);

    expect(mount.mock.calls[0]?.[3]).toMatchObject({
      detailLevel: "navigation",
    });
  });

  it("changes theme mid-navigation without interrupting the session", async () => {
    const destroy = vi.fn();
    const setMapStyle = vi.fn();
    const setUserLocation = vi.fn();
    const mount = vi.fn<NavigationMapEngine["mount"]>(() => ({
      destroy,
      setUserLocation,
      setFollowUser: vi.fn(),
      recenter: vi.fn(),
      setViewModel: vi.fn(),
      setMapStyle,
    }));

    render(
      <AppearanceProvider>
        <MapThemeProvider>
          <ArcadePicker />
          <NavigationMap
            route={route}
            engine={{ mount } as NavigationMapEngine}
            userLocation={{ latitude: 45.4, longitude: -72.7 }}
            headingDeg={12}
          />
        </MapThemeProvider>
      </AppearanceProvider>,
    );
    expect(mount).toHaveBeenCalledTimes(1);
    setUserLocation.mockClear();

    act(() => {
      screen.getByRole("button", { name: "Kart Arcade" }).click();
    });

    await waitFor(() => {
      expect(setMapStyle).toHaveBeenCalledWith(
        mapThemeStyle("kart-arcade"),
        mapThemeOverlay("kart-arcade"),
      );
    });
    // The session keeps its engine, its camera and its GPS feed.
    expect(mount).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
    expect(setUserLocation).not.toHaveBeenCalled();
  });
});
