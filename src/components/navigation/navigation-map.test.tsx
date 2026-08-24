import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GeneratedLoopRoute } from "@/domain/ride/types";
import type { NavigationMapEngine } from "@/components/map/navigation-map-engine";
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
