import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  DestinationPickerMapEngine,
  DestinationPickerMapHandlers,
} from "@/components/map/destination-picker-map-engine";
import type { Coordinates, Place } from "@/domain/geo/types";
import { DestinationMapPicker } from "./destination-map-picker";

const currentPosition = { latitude: 45.4001, longitude: -72.7342 };
const firstPoint = { latitude: 45.405, longitude: -72.72 };
const movedPoint = { latitude: 45.41, longitude: -72.71 };

function pickerEngine() {
  let handlers: DestinationPickerMapHandlers | undefined;
  const destroy = vi.fn();
  const engine: DestinationPickerMapEngine = {
    mount: vi.fn((_container, _options, nextHandlers) => {
      handlers = nextHandlers;
      return { destroy };
    }),
  };
  return {
    engine,
    destroy,
    pick(coordinates: Coordinates) {
      if (!handlers) {
        throw new Error("Map not mounted");
      }
      act(() => handlers?.onPick(coordinates));
    },
  };
}

function reverseResult(coordinates: Coordinates, label: string): Place {
  return {
    label,
    name: label,
    locality: "Granby",
    region: "Québec",
    country: "Canada",
    coordinates,
    type: "address",
  };
}

describe("DestinationMapPicker", () => {
  it("places and moves the marker, reverse geocodes the latest point, and confirms exact coordinates", async () => {
    const map = pickerEngine();
    const reversePlace = vi.fn(async (coordinates: Coordinates) =>
      reverseResult(
        coordinates,
        coordinates === firstPoint ? "Première adresse" : "Adresse déplacée",
      ),
    );
    const onConfirm = vi.fn();
    render(
      <DestinationMapPicker
        currentPosition={currentPosition}
        reversePlace={reversePlace}
        mapEngine={map.engine}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    map.pick(firstPoint);
    expect(await screen.findByText("Première adresse")).toBeInTheDocument();
    map.pick(movedPoint);
    expect(await screen.findByText("Adresse déplacée")).toBeInTheDocument();
    expect(screen.getByText(/45\.41000, -72\.71000/)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Utiliser cette destination" }),
    );
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Adresse déplacée",
        coordinates: movedPoint,
        source: "map",
        precision: "exact",
      }),
    );
  });

  it("allows coordinate selection when reverse geocoding fails", async () => {
    const map = pickerEngine();
    const onConfirm = vi.fn();
    render(
      <DestinationMapPicker
        currentPosition={currentPosition}
        reversePlace={async () => {
          throw new Error("offline");
        }}
        mapEngine={map.engine}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    map.pick(firstPoint);
    expect(
      await screen.findByText("Point sélectionné sur la carte"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Aucune adresse trouvée/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Utiliser cette destination" }),
    );

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Point sélectionné sur la carte",
        coordinates: firstPoint,
      }),
    );
  });

  it("cancels without replacing the previously selected destination", async () => {
    const map = pickerEngine();
    const previous = reverseResult(currentPosition, "Destination précédente");
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <DestinationMapPicker
        currentPosition={currentPosition}
        initialDestination={previous}
        reversePlace={async (coordinates) =>
          reverseResult(coordinates, "Nouvelle destination")
        }
        mapEngine={map.engine}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText("Destination précédente")).toBeInTheDocument();
    map.pick(firstPoint);
    await screen.findByText("Nouvelle destination");
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("ignores an older reverse-geocoding response after the marker moves", async () => {
    const map = pickerEngine();
    let resolveFirst: (place: Place) => void = () => {};
    const reversePlace = vi.fn((coordinates: Coordinates) => {
      if (coordinates === firstPoint) {
        return new Promise<Place>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve(reverseResult(coordinates, "Adresse récente"));
    });
    render(
      <DestinationMapPicker
        currentPosition={currentPosition}
        reversePlace={reversePlace}
        mapEngine={map.engine}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    map.pick(firstPoint);
    map.pick(movedPoint);
    expect(await screen.findByText("Adresse récente")).toBeInTheDocument();
    resolveFirst(reverseResult(firstPoint, "Adresse obsolète"));
    await waitFor(() => {
      expect(screen.queryByText("Adresse obsolète")).not.toBeInTheDocument();
    });
  });
});
