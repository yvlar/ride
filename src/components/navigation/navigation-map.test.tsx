import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GeneratedLoopRoute } from "@/domain/ride/types";
import type { NavigationMapEngine } from "@/components/map/navigation-map-engine";
import { NavigationMap } from "./navigation-map";
import { AppearanceProvider } from "@/components/theme/appearance-provider";
import {
  MapThemeProvider,
  useMapTheme,
} from "@/components/theme/map-theme-provider";
import { mapThemeStyle } from "@/components/map/map-theme-styles";

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

  it("changes to Kart Arcade without interrupting navigation or losing GPS", async () => {
    const destroy = vi.fn();
    const setMapStyle = vi.fn();
    const setUserLocation = vi.fn();
    const mount = vi.fn(() => ({
      destroy,
      setUserLocation,
      setFollowUser: vi.fn(),
      recenter: vi.fn(),
      setViewModel: vi.fn(),
      setMapStyle,
    }));
    const engine: NavigationMapEngine = { mount };

    function ThemeSwitcher() {
      const { setTheme } = useMapTheme();
      return (
        <button type="button" onClick={() => setTheme("kart-arcade")}>
          Kart Arcade
        </button>
      );
    }

    render(
      <AppearanceProvider>
        <MapThemeProvider>
          <ThemeSwitcher />
          <NavigationMap
            route={route}
            engine={engine}
            userLocation={{ latitude: 45.41, longitude: -72.72 }}
            headingDeg={90}
          />
        </MapThemeProvider>
      </AppearanceProvider>,
    );

    expect(mount).toHaveBeenCalledTimes(1);
    act(() => {
      screen.getByRole("button", { name: "Kart Arcade" }).click();
    });

    await waitFor(() => {
      expect(setMapStyle).toHaveBeenCalledWith(
        mapThemeStyle("kart-arcade", "navigation", "dark"),
      );
    });
    expect(mount).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
    expect(setUserLocation).toHaveBeenCalledWith(
      { latitude: 45.41, longitude: -72.72 },
      90,
    );
    expect(setUserLocation).not.toHaveBeenCalledWith(null, expect.anything());
  });
});
