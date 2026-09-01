import { act, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Place } from "@/domain/geo/types";
import type { GeneratedDestinationRoute, GeneratedLoopRoute } from "@/domain/ride/types";
import { GPS_TRACKING_UNAVAILABLE_MESSAGE } from "./geolocate-control-options";
import { AppearanceProvider } from "@/components/theme/appearance-provider";
import {
  MapThemeProvider,
  useMapTheme,
} from "@/components/theme/map-theme-provider";
import { MAP_UNAVAILABLE_MESSAGE, type MapEngine } from "./map-engine";
import { mapThemeOverlay } from "./map-theme-overlay";
import { mapThemeStyle } from "./map-theme-styles";
import { RideMap } from "./ride-map";
import type { WeatherMapOverlay } from "./weather-overlay";

const granby: Place = {
  label: "Granby, QC",
  coordinates: { latitude: 45.4001, longitude: -72.7342 },
};

const tremblant: Place = {
  label: "Mont-Tremblant, QC",
  coordinates: { latitude: 46.1185, longitude: -74.5962 },
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

const destination: GeneratedDestinationRoute = {
  id: "dest-1",
  type: "destination",
  start: granby,
  destination: tremblant,
  style: "scenic",
  geometry: {
    type: "LineString",
    coordinates: [
      [-72.7342, 45.4001],
      [-74.5962, 46.1185],
    ],
  },
  segments: [],
  distanceKm: 140,
  durationMinutes: 110,
  warnings: [],
};

function stubEngine(): MapEngine {
  return {
    mount: vi.fn(() => ({ destroy: vi.fn() })),
  };
}

describe("RideMap (FR-013, NFR-001)", () => {
  it("renders the map region with start and direction labels", async () => {
    const engine = stubEngine();
    render(<RideMap route={loop} engine={engine} />);

    const map = screen.getByRole("region", { name: "Carte du trajet" });
    expect(map).toHaveTextContent("Sens : boucle depuis Granby, QC");
    expect(map).toHaveTextContent("Départ : Granby, QC");
    expect(map).not.toHaveTextContent("Destination :");
    await waitFor(() => {
      expect(engine.mount).toHaveBeenCalled();
    });
  });

  it("labels the destination when the route has one", () => {
    render(<RideMap route={destination} engine={stubEngine()} />);

    const map = screen.getByRole("region", { name: "Carte du trajet" });
    expect(map).toHaveTextContent("Destination : Mont-Tremblant, QC");
    expect(map).toHaveTextContent("Sens : Granby, QC → Mont-Tremblant, QC");
  });

  it("keeps textual route facts when the map engine fails (FR-013)", async () => {
    const engine: MapEngine = {
      mount: (_container, _viewModel, { onError }) => {
        onError(MAP_UNAVAILABLE_MESSAGE);
        return { destroy() {} };
      },
    };

    render(
      <div>
        <p>198.4 km · 150 min</p>
        <RideMap route={loop} engine={engine} />
      </div>,
    );

    expect(await screen.findByText(MAP_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText("198.4 km · 150 min")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Carte du trajet" }),
    ).toHaveTextContent("Sens : boucle depuis Granby, QC");
  });

  it("keeps textual route facts when GPS tracking fails (FR-022)", async () => {
    const engine: MapEngine = {
      mount: (_container, _viewModel, { onWarning }) => {
        onWarning?.(GPS_TRACKING_UNAVAILABLE_MESSAGE);
        return { destroy() {} };
      },
    };

    render(
      <div>
        <p>198.4 km · 150 min</p>
        <RideMap route={loop} engine={engine} />
      </div>,
    );

    expect(
      await screen.findByText(GPS_TRACKING_UNAVAILABLE_MESSAGE),
    ).toBeInTheDocument();
    expect(screen.getByText("198.4 km · 150 min")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Carte du trajet" }),
    ).toHaveTextContent("Sens : boucle depuis Granby, QC");
    expect(screen.queryByText(MAP_UNAVAILABLE_MESSAGE)).not.toBeInTheDocument();
  });

  it("does not refit the initial camera after mount (FR-013, NFR-006)", async () => {
    const setViewModel = vi.fn();
    const mount = vi.fn(() => ({ destroy: vi.fn(), setViewModel }));
    const engine: MapEngine = { mount };

    render(<RideMap route={loop} engine={engine} />);
    await waitFor(() => {
      expect(mount).toHaveBeenCalledTimes(1);
    });
    expect(setViewModel).not.toHaveBeenCalled();
  });

  it("updates the preview route without remounting the engine (FR-013, FR-026)", async () => {
    const destroy = vi.fn();
    const setViewModel = vi.fn();
    const mount = vi.fn(() => ({ destroy, setViewModel }));
    const engine: MapEngine = { mount };

    const { rerender } = render(<RideMap route={loop} engine={engine} />);
    await waitFor(() => {
      expect(mount).toHaveBeenCalledTimes(1);
    });

    rerender(<RideMap route={{ ...loop, id: "loop-2" }} engine={engine} />);
    await waitFor(() => {
      expect(setViewModel).toHaveBeenCalled();
    });
    expect(mount).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("keeps the street map mounted when the preview expands for navigation (FR-013, FR-023)", async () => {
    const destroy = vi.fn();
    const setUserLocation = vi.fn();
    const setFollowUser = vi.fn();
    const resize = vi.fn();
    const setGeolocateEnabled = vi.fn();
    const mount = vi.fn(() => ({
      destroy,
      setUserLocation,
      setFollowUser,
      resize,
      setGeolocateEnabled,
    }));
    const engine: MapEngine = { mount };

    const { rerender } = render(<RideMap route={loop} engine={engine} />);
    await waitFor(() => {
      expect(mount).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(setGeolocateEnabled).toHaveBeenCalledWith(true);
    });
    await waitFor(() => {
      expect(setFollowUser).toHaveBeenCalledWith(false);
    });

    rerender(
      <RideMap
        route={loop}
        engine={engine}
        expanded
        userLocation={{ latitude: 45.4001, longitude: -72.7342 }}
        headingDeg={90}
      />,
    );
    await waitFor(() => {
      expect(setUserLocation).toHaveBeenCalledWith(
        {
          latitude: 45.4001,
          longitude: -72.7342,
        },
        90,
      );
    });
    expect(setGeolocateEnabled).toHaveBeenCalledWith(false);
    expect(setFollowUser).toHaveBeenCalledWith(true);
    expect(screen.getByRole("region", { name: "Carte du trajet" })).not.toHaveTextContent(
      "Sens : boucle depuis Granby, QC",
    );
    expect(mount).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(resize).toHaveBeenCalled();
    });

    rerender(<RideMap route={loop} engine={engine} />);
    await waitFor(() => {
      expect(setGeolocateEnabled).toHaveBeenLastCalledWith(true);
    });
    expect(setFollowUser).toHaveBeenLastCalledWith(false);
    expect(mount).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("fills the parent without enabling follow-user (FR-013, FR-031)", async () => {
    const setFollowUser = vi.fn();
    const setGeolocateEnabled = vi.fn();
    const mount = vi.fn(() => ({
      destroy: vi.fn(),
      setFollowUser,
      setGeolocateEnabled,
    }));
    const engine: MapEngine = { mount };

    render(<RideMap route={loop} engine={engine} fill />);
    await waitFor(() => {
      expect(mount).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(setFollowUser).toHaveBeenCalledWith(false);
    });
    expect(setGeolocateEnabled).toHaveBeenCalledWith(true);
    expect(screen.getByRole("region", { name: "Carte du trajet" })).not.toHaveTextContent(
      "Sens : boucle depuis Granby, QC",
    );
  });

  it("hands the weather overlay to the engine and follows it (FR-043)", async () => {
    const setWeather = vi.fn();
    const mount = vi.fn(() => ({ destroy: vi.fn(), setWeather }));
    const weather: WeatherMapOverlay = {
      radarTileUrlTemplate: "https://tiles.test/{z}/{x}/{y}.png",
      radarOpacity: 0.6,
      radarMaxZoom: 7,
      attribution: "Images radar © Test",
      clouds: [
        {
          id: "cloud-1",
          coordinates: { latitude: 45.2, longitude: -73.1 },
          level: "rain",
          probability: 72,
          label: "Pluie, 72 % de risque de pluie",
        },
      ],
    };

    const view = render(
      <RideMap route={loop} engine={{ mount } as MapEngine} weather={null} />,
    );
    await waitFor(() => {
      expect(mount).toHaveBeenCalledTimes(1);
    });
    expect(setWeather).toHaveBeenCalledWith(null);

    view.rerender(
      <RideMap route={loop} engine={{ mount } as MapEngine} weather={weather} />,
    );

    await waitFor(() => {
      expect(setWeather).toHaveBeenLastCalledWith(weather);
    });
  });

  it("mounts without a weather layer on an engine that has none (FR-043)", async () => {
    const mount = vi.fn(() => ({ destroy: vi.fn() }));

    render(<RideMap route={loop} engine={{ mount } as MapEngine} />);

    await waitFor(() => {
      expect(mount).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.getByRole("region", { name: "Carte du trajet" }),
    ).toBeInTheDocument();
  });
});

describe("RideMap basemap theme (FR-045)", () => {
  function ThemePicker() {
    const { setTheme } = useMapTheme();
    return (
      <button type="button" onClick={() => setTheme("terrain")}>
        Relief
      </button>
    );
  }

  it("mounts with the resolved theme and swaps it without remounting", async () => {
    const setMapStyle = vi.fn();
    const mount = vi.fn<MapEngine["mount"]>(() => ({
      destroy: vi.fn(),
      setMapStyle,
    }));
    const engine: MapEngine = { mount };

    render(
      <AppearanceProvider>
        <MapThemeProvider>
          <ThemePicker />
          <RideMap route={loop} engine={engine} />
        </MapThemeProvider>
      </AppearanceProvider>,
    );

    await waitFor(() => {
      expect(mount).toHaveBeenCalledTimes(1);
    });
    // The default appearance is dark, so Automatique picks the dark basemap.
    expect(mount.mock.calls[0]?.[3]).toEqual({
      mapStyle: mapThemeStyle("dark"),
      mapOverlay: mapThemeOverlay("dark"),
      detailLevel: "exploration",
    });

    act(() => {
      screen.getByRole("button", { name: "Relief" }).click();
    });

    await waitFor(() => {
      expect(setMapStyle).toHaveBeenCalledWith(
        mapThemeStyle("terrain"),
        mapThemeOverlay("terrain"),
      );
    });
    // The rider keeps the same map: only its basemap changed.
    expect(mount).toHaveBeenCalledTimes(1);
    window.localStorage.clear();
  });
});

describe("RideMap Kart Arcade (FR-046)", () => {
  function ArcadePicker() {
    const { setTheme, theme } = useMapTheme();
    return (
      <>
        <span data-testid="picked">{theme}</span>
        <button type="button" onClick={() => setTheme("kart-arcade")}>
          Kart Arcade
        </button>
        <button type="button" onClick={() => setTheme("auto")}>
          Automatique
        </button>
      </>
    );
  }

  function renderWithTheme(ui: ReactNode) {
    return render(
      <AppearanceProvider>
        <MapThemeProvider>
          <ArcadePicker />
          {ui}
        </MapThemeProvider>
      </AppearanceProvider>,
    );
  }

  afterEach(() => {
    window.localStorage.clear();
  });

  it("swaps to the arcade theme and back without remounting the map", async () => {
    const setMapStyle = vi.fn();
    const destroy = vi.fn();
    const mount = vi.fn<MapEngine["mount"]>(() => ({ destroy, setMapStyle }));

    renderWithTheme(
      <RideMap route={loop} engine={{ mount } as MapEngine} />,
    );
    await waitFor(() => {
      expect(mount).toHaveBeenCalledTimes(1);
    });

    act(() => {
      screen.getByRole("button", { name: "Kart Arcade" }).click();
    });
    await waitFor(() => {
      expect(setMapStyle).toHaveBeenCalledWith(
        mapThemeStyle("kart-arcade"),
        mapThemeOverlay("kart-arcade"),
      );
    });

    act(() => {
      screen.getByRole("button", { name: "Automatique" }).click();
    });
    await waitFor(() => {
      expect(setMapStyle).toHaveBeenLastCalledWith(
        mapThemeStyle("dark"),
        mapThemeOverlay("dark"),
      );
    });

    // The route, its markers and the GPS puck all live inside the same engine
    // instance: it is never torn down, so none of them can be lost (FR-046).
    expect(mount).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("keeps the route, the markers and the position through the swap", async () => {
    const setMapStyle = vi.fn();
    const setViewModel = vi.fn();
    const setUserLocation = vi.fn();
    const mount = vi.fn<MapEngine["mount"]>(() => ({
      destroy: vi.fn(),
      setMapStyle,
      setViewModel,
      setUserLocation,
    }));
    const location = { latitude: 45.4, longitude: -72.73 };

    renderWithTheme(
      <RideMap
        route={loop}
        engine={{ mount } as MapEngine}
        userLocation={location}
        headingDeg={90}
      />,
    );
    await waitFor(() => {
      expect(mount).toHaveBeenCalledTimes(1);
    });
    setViewModel.mockClear();
    setUserLocation.mockClear();

    act(() => {
      screen.getByRole("button", { name: "Kart Arcade" }).click();
    });
    await waitFor(() => {
      expect(setMapStyle).toHaveBeenCalled();
    });

    // Nothing was re-pushed, because nothing was lost: the engine replays what
    // it owns once the new style settles.
    expect(setViewModel).not.toHaveBeenCalled();
    expect(setUserLocation).not.toHaveBeenCalled();
    expect(mount.mock.calls[0]?.[1]?.start.label).toBe("Départ");
  });

  it("returns the rider to the default theme when the basemap fails", async () => {
    const mount = vi.fn<MapEngine["mount"]>(() => ({
      destroy: vi.fn(),
      setMapStyle: vi.fn(),
    }));

    renderWithTheme(
      <RideMap route={loop} engine={{ mount } as MapEngine} />,
    );
    await waitFor(() => {
      expect(mount).toHaveBeenCalledTimes(1);
    });

    act(() => {
      screen.getByRole("button", { name: "Kart Arcade" }).click();
    });
    expect(screen.getByTestId("picked")).toHaveTextContent("kart-arcade");

    act(() => {
      mount.mock.calls[0]?.[2]?.onMapStyleFallback?.();
    });

    expect(screen.getByTestId("picked")).toHaveTextContent("auto");
  });

  it("explores by default and strips the theme back while following the rider", async () => {
    const mount = vi.fn<MapEngine["mount"]>(() => ({ destroy: vi.fn() }));

    const { unmount } = renderWithTheme(
      <RideMap route={loop} engine={{ mount } as MapEngine} />,
    );
    await waitFor(() => {
      expect(mount.mock.calls[0]?.[3]?.detailLevel).toBe("exploration");
    });
    unmount();

    // `expanded` is how this map says a live session owns the screen.
    const navMount = vi.fn<MapEngine["mount"]>(() => ({ destroy: vi.fn() }));
    renderWithTheme(
      <RideMap route={loop} engine={{ mount: navMount } as MapEngine} expanded />,
    );
    await waitFor(() => {
      expect(navMount.mock.calls[0]?.[3]?.detailLevel).toBe("navigation");
    });
  });

  it("switches the detail level in place when navigation starts", async () => {
    const setDetailLevel = vi.fn();
    const mount = vi.fn<MapEngine["mount"]>(() => ({
      destroy: vi.fn(),
      setDetailLevel,
    }));
    const engine: MapEngine = { mount };

    const { rerender } = renderWithTheme(
      <RideMap route={loop} engine={engine} />,
    );
    await waitFor(() => {
      expect(mount).toHaveBeenCalledTimes(1);
    });

    rerender(
      <AppearanceProvider>
        <MapThemeProvider>
          <ArcadePicker />
          <RideMap route={loop} engine={engine} expanded />
        </MapThemeProvider>
      </AppearanceProvider>,
    );

    await waitFor(() => {
      expect(setDetailLevel).toHaveBeenCalledWith("navigation");
    });
    expect(mount).toHaveBeenCalledTimes(1);
  });
});
