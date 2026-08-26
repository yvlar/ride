import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MAP_POINT_LABEL } from "@/domain/destination/destination";
import type { Coordinates, Place } from "@/domain/geo/types";
import { DestinationMapPicker } from "./destination-map-picker";
import type { MapEngine, MapEngineHandlers } from "./map-engine";

/**
 * Stands in for MapLibre. It captures the `onPick` callback so a test can
 * simulate a long press, a click, or a marker drag, and records every
 * `setPickMarker` call so marker movement is observable.
 */
function pickerEngine() {
  const markers: Array<Coordinates | null> = [];
  let pick: ((coordinates: Coordinates) => void) | undefined;
  let pickEnabled = false;

  const engine: MapEngine = {
    mount: vi.fn((_container, _viewModel, handlers: MapEngineHandlers) => {
      pick = handlers.onPick;
      return {
        destroy: vi.fn(),
        setPickEnabled: (enabled: boolean) => {
          pickEnabled = enabled;
        },
        setPickMarker: (coordinates: Coordinates | null) => {
          markers.push(coordinates);
        },
      };
    }),
  };

  return {
    engine,
    markers,
    pickEnabled: () => pickEnabled,
    drop(coordinates: Coordinates) {
      pick?.(coordinates);
    },
  };
}

const granby = { latitude: 45.4001, longitude: -72.7342 };
const moved = { latitude: 45.4102, longitude: -72.7205 };

const granbyPlace: Place = {
  label: "125 Rue Principale, Granby, Québec, Canada",
  name: "125 Rue Principale",
  locality: "Granby",
  region: "Québec",
  country: "Canada",
  kind: "address",
  precision: "exact",
  coordinates: granby,
};

describe("DestinationMapPicker (FR-038)", () => {
  it("arms picking and places a marker where the rider presses", async () => {
    const map = pickerEngine();
    render(
      <DestinationMapPicker
        engine={map.engine}
        reversePlace={async () => granbyPlace}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    await waitFor(() => expect(map.engine.mount).toHaveBeenCalled());
    expect(map.pickEnabled()).toBe(true);
    expect(
      screen.getByRole("button", { name: "Utiliser cette destination" }),
    ).toBeDisabled();

    map.drop(granby);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Utiliser cette destination" }),
      ).toBeEnabled();
    });
    expect(map.markers.at(-1)).toEqual(granby);
  });

  it("moves the marker when the rider drags it to a new point", async () => {
    const map = pickerEngine();
    const reversePlace = vi.fn(async (coordinates: Coordinates) => ({
      ...granbyPlace,
      coordinates,
    }));
    render(
      <DestinationMapPicker
        engine={map.engine}
        reversePlace={reversePlace}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    await waitFor(() => expect(map.engine.mount).toHaveBeenCalled());

    map.drop(granby);
    await waitFor(() => expect(map.markers.at(-1)).toEqual(granby));

    // A drag reports through the same callback as the initial press.
    map.drop(moved);
    await waitFor(() => expect(map.markers.at(-1)).toEqual(moved));
    expect(reversePlace).toHaveBeenLastCalledWith(moved);
  });

  it("shows the reverse-geocoded address for the placed point", async () => {
    const map = pickerEngine();
    render(
      <DestinationMapPicker
        engine={map.engine}
        reversePlace={async () => granbyPlace}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    await waitFor(() => expect(map.engine.mount).toHaveBeenCalled());

    map.drop(granby);

    expect(await screen.findByText("125 Rue Principale")).toBeInTheDocument();
    expect(screen.getByText(/Granby/)).toBeInTheDocument();
    expect(screen.getByText("45.40010, -72.73420")).toBeInTheDocument();
  });

  it("still confirms by coordinates when reverse geocoding fails", async () => {
    const map = pickerEngine();
    const onConfirm = vi.fn();
    render(
      <DestinationMapPicker
        engine={map.engine}
        reversePlace={async () => {
          throw new Error("offline");
        }}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    await waitFor(() => expect(map.engine.mount).toHaveBeenCalled());

    map.drop(granby);

    expect(await screen.findByText(MAP_POINT_LABEL)).toBeInTheDocument();
    const confirm = screen.getByRole("button", {
      name: "Utiliser cette destination",
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const destination = onConfirm.mock.calls[0]?.[0] as Place;
    expect(destination.coordinates).toEqual(granby);
    expect(destination.source).toBe("map");
    expect(destination.label).toContain(MAP_POINT_LABEL);
  });

  it("confirms the reverse-geocoded place with the picked coordinates", async () => {
    const map = pickerEngine();
    const onConfirm = vi.fn();
    render(
      <DestinationMapPicker
        engine={map.engine}
        reversePlace={async () => granbyPlace}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    await waitFor(() => expect(map.engine.mount).toHaveBeenCalled());

    map.drop(moved);
    await screen.findByText("125 Rue Principale");
    fireEvent.click(
      screen.getByRole("button", { name: "Utiliser cette destination" }),
    );

    const destination = onConfirm.mock.calls[0]?.[0] as Place;
    // The picked point wins over the coordinates the geocoder echoed back.
    expect(destination.coordinates).toEqual(moved);
    expect(destination.locality).toBe("Granby");
  });

  it("cancels without confirming anything", async () => {
    const map = pickerEngine();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <DestinationMapPicker
        engine={map.engine}
        reversePlace={async () => granbyPlace}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    await waitFor(() => expect(map.engine.mount).toHaveBeenCalled());

    map.drop(granby);
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("starts from the destination already selected", async () => {
    const map = pickerEngine();
    render(
      <DestinationMapPicker
        engine={map.engine}
        initialPoint={granby}
        reversePlace={async () => granbyPlace}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    await waitFor(() => expect(map.engine.mount).toHaveBeenCalled());
    expect(map.markers.at(-1)).toEqual(granby);
    expect(
      screen.getByRole("button", { name: "Utiliser cette destination" }),
    ).toBeEnabled();
  });
});
