import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Place } from "@/domain/geo/types";
import type { GeneratedDestinationRoute, GeneratedLoopRoute } from "@/domain/ride/types";
import { MAP_UNAVAILABLE_MESSAGE, type MapEngine } from "./map-engine";
import { RideMap } from "./ride-map";

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
});
