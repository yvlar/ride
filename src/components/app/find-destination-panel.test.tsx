import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FindDestinationPanel,
  type FindDestinationPanelProps,
} from "./find-destination-panel";
import { CurrentPositionError } from "@/components/ride-form/browser-geolocation";
import type {
  DestinationPickerMapEngine,
  DestinationPickerMapHandlers,
} from "@/components/map/destination-picker-map-engine";
import {
  ROUTE_PREFERENCES_STORAGE_KEY,
  writeStoredRoutePreferences,
} from "@/domain/ride/stored-route-preferences";
import type { Place } from "@/domain/geo/types";
import type {
  GenerateRideRequest,
  GenerateRideResult,
  GeneratedDestinationRoute,
} from "@/domain/ride/types";

const granby: Place = {
  label: "12 Rue Principale, Granby",
  coordinates: { latitude: 45.4001, longitude: -72.7342 },
};

const tremblant: Place = {
  label: "Mont-Tremblant",
  name: "Mont-Tremblant",
  region: "Québec",
  country: "Canada",
  type: "city",
  source: "search",
  precision: "approximate",
  coordinates: { latitude: 46.118, longitude: -74.596 },
};

const located = {
  coordinates: granby.coordinates,
  accuracyMeters: 8,
};

const route: GeneratedDestinationRoute = {
  id: "route-1",
  type: "destination",
  start: granby,
  destination: tremblant,
  style: "scenic",
  geometry: {
    type: "LineString",
    coordinates: [
      [-72.7342, 45.4001],
      [-74.596, 46.118],
    ],
  },
  segments: [],
  distanceKm: 118.4,
  durationMinutes: 105,
  warnings: [],
};

const laterRoute: GeneratedDestinationRoute = {
  ...route,
  id: "route-2",
  distanceKm: 122.1,
};

function pickerEngine() {
  let handlers: DestinationPickerMapHandlers | undefined;
  const engine: DestinationPickerMapEngine = {
    mount: vi.fn((_container, _options, nextHandlers) => {
      handlers = nextHandlers;
      return { destroy: vi.fn() };
    }),
  };
  return {
    engine,
    pick(coordinates: Place["coordinates"]) {
      if (!handlers) {
        throw new Error("Map not mounted");
      }
      act(() => handlers?.onPick(coordinates));
    },
  };
}

function renderPanel(overrides: Partial<FindDestinationPanelProps> = {}) {
  return render(
    <FindDestinationPanel
      requestPosition={async () => located}
      reversePlace={async (coordinates) => ({ ...granby, coordinates })}
      searchPlaces={async () => [tremblant]}
      debounceMs={0}
      onRequestComposed={() => {}}
      onGeneratedRouteChange={() => {}}
      onStartNavigation={() => {}}
      onBack={() => {}}
      {...overrides}
    />,
  );
}

async function selectTremblant() {
  fireEvent.change(screen.getByRole("combobox", { name: "Adresse, ville ou code postal" }), {
    target: { value: "Mont" },
  });
  fireEvent.click(
    await screen.findByRole("option", { name: "Mont-Tremblant" }),
  );
}

describe("FindDestinationPanel (FR-038)", () => {
  beforeEach(() => {
    window.localStorage.removeItem(ROUTE_PREFERENCES_STORAGE_KEY);
  });

  it("locates automatically and hides origin, distance, and preference controls", async () => {
    renderPanel();

    expect(await screen.findByText(/Position détectée/)).toBeInTheDocument();
    expect(screen.getByText(/12 Rue Principale, Granby/)).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Adresse, ville ou code postal" }),
    ).toBeEnabled();
    expect(screen.queryByLabelText("Point de départ")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ma position" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("slider", { name: /Distance/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Durée disponible/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Éviter les autoroutes")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Éviter les routes non pavées"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Canada seulement")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Générer le trajet" }),
    ).toBeDisabled();
  });

  it("keeps generate disabled without a valid destination or GPS (FR-038)", async () => {
    const { unmount } = renderPanel();
    await screen.findByText(/Position détectée/);
    expect(
      screen.getByRole("button", { name: "Générer le trajet" }),
    ).toBeDisabled();
    unmount();

    renderPanel({
      requestPosition: async () => {
        throw new CurrentPositionError("permission_denied");
      },
    });
    expect(
      await screen.findByText("L’autorisation de localisation a été refusée."),
    ).toBeInTheDocument();
    await selectTremblant();
    expect(
      screen.getByRole("button", { name: "Générer le trajet" }),
    ).toBeDisabled();
  });

  it("uses the current GPS as origin and settings preferences (FR-007, FR-008, FR-030, FR-038)", async () => {
    writeStoredRoutePreferences(window.localStorage, {
      avoidHighways: false,
      avoidUnpaved: false,
      stayInCanada: true,
    });
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route,
    }));
    const onRequestComposed = vi.fn();
    renderPanel({ generateRide, onRequestComposed });
    await screen.findByText(/Position détectée/);
    await selectTremblant();
    fireEvent.click(screen.getByRole("button", { name: "Générer le trajet" }));

    expect(
      await screen.findByRole("button", { name: "Démarrer la navigation" }),
    ).toBeEnabled();
    expect(generateRide).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "destination",
        start: granby,
        destination: tremblant,
        style: "scenic",
        preferences: {
          avoidHighways: false,
          avoidUnpaved: false,
          stayInCanada: true,
        },
      }),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        originAccuracyMeters: 8,
      }),
    );
    expect(onRequestComposed.mock.calls[0]?.[0]).not.toHaveProperty(
      "targetDistanceKm",
    );
    expect(screen.getByText(/118\.4 km/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Modifier la destination" })).toBeEnabled();
  });

  it("previews the generated route and starts navigation without generating again (FR-023, FR-038)", async () => {
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route,
    }));
    const regenerateRide = vi.fn();
    const onStartNavigation = vi.fn();
    renderPanel({ generateRide, regenerateRide, onStartNavigation });
    await screen.findByText(/Position détectée/);
    await selectTremblant();
    fireEvent.click(screen.getByRole("button", { name: "Générer le trajet" }));
    const start = await screen.findByRole("button", {
      name: "Démarrer la navigation",
    });
    expect(start).toBeEnabled();
    expect(onStartNavigation).not.toHaveBeenCalled();
    expect(screen.getByTestId("destination-flow")).toHaveAttribute(
      "data-destination-flow",
      "routePreview",
    );
    fireEvent.click(start);
    fireEvent.click(start);

    expect(onStartNavigation).toHaveBeenCalledTimes(1);
    expect(generateRide).toHaveBeenCalledTimes(1);
    expect(regenerateRide).not.toHaveBeenCalled();
    expect(screen.getByTestId("destination-flow")).toHaveAttribute(
      "data-destination-flow",
      "navigating",
    );
    expect(
      screen.queryByRole("button", { name: "Démarrer la navigation" }),
    ).not.toBeInTheDocument();
  });

  it("returns to destination search after navigation is cancelled (FR-023, FR-038)", async () => {
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route,
    }));
    const requestPosition = vi.fn(async () => located);
    const props: FindDestinationPanelProps = {
      generateRide,
      requestPosition,
      reversePlace: async (coordinates) => ({ ...granby, coordinates }),
      searchPlaces: async () => [tremblant],
      debounceMs: 0,
      onRequestComposed: () => {},
      onGeneratedRouteChange: () => {},
      onStartNavigation: () => {},
      onBack: () => {},
    };
    const { rerender } = render(<FindDestinationPanel {...props} />);
    await screen.findByText(/Position détectée/);
    await selectTremblant();
    fireEvent.click(screen.getByRole("button", { name: "Générer le trajet" }));
    await screen.findByRole("button", { name: "Démarrer la navigation" });

    rerender(<FindDestinationPanel {...props} navigationActive />);
    rerender(<FindDestinationPanel {...props} navigationActive={false} />);

    await waitFor(() => {
      expect(requestPosition.mock.calls.length).toBeGreaterThan(1);
    });
    expect(
      await screen.findByRole("button", { name: "Générer le trajet" }),
    ).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Adresse, ville ou code postal" })).toHaveValue(
      "Mont-Tremblant",
    );
    expect(
      screen.queryByRole("button", { name: "Démarrer la navigation" }),
    ).not.toBeInTheDocument();
  });

  it("ignores a stale generation response (FR-038)", async () => {
    const resolvers: Array<(value: GenerateRideResult) => void> = [];
    const generateRide = vi.fn(
      () =>
        new Promise<GenerateRideResult>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const onGeneratedRouteChange = vi.fn();
    renderPanel({ generateRide, onGeneratedRouteChange });
    await screen.findByText(/Position détectée/);
    await selectTremblant();
    fireEvent.click(screen.getByRole("button", { name: "Générer le trajet" }));
    await waitFor(() => expect(generateRide).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByRole("combobox", { name: "Adresse, ville ou code postal" }), {
      target: { value: "Mont" },
    });
    fireEvent.click(
      await screen.findByRole("option", { name: "Mont-Tremblant" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Générer le trajet" }));
    await waitFor(() => expect(generateRide).toHaveBeenCalledTimes(2));

    resolvers[0]?.({ ok: true, route });
    await act(async () => {
      await Promise.resolve();
    });
    expect(onGeneratedRouteChange).not.toHaveBeenCalled();
    expect(screen.queryByText(/118\.4 km/)).not.toBeInTheDocument();
    resolvers[1]?.({ ok: true, route: laterRoute });
    expect(
      await screen.findByRole("button", { name: "Démarrer la navigation" }),
    ).toBeEnabled();
    expect(onGeneratedRouteChange).toHaveBeenCalledTimes(1);
    expect(onGeneratedRouteChange).toHaveBeenCalledWith(laterRoute);
    expect(screen.getByText(/122\.1 km/)).toBeInTheDocument();
  });

  it("shows geolocation and generation errors with retry actions (FR-021, FR-038)", async () => {
    const { unmount } = renderPanel({
      requestPosition: async () => {
        throw new CurrentPositionError("permission_denied");
      },
      openLocationSettings: () => false,
    });
    expect(
      await screen.findByText("L’autorisation de localisation a été refusée."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Réessayer la localisation" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Ouvrir les réglages de localisation" }),
    ).toBeEnabled();
    unmount();

    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: false,
      error: {
        code: "NO_ROUTE_FOUND",
        message: "Aucun trajet valide n’a pu être trouvé.",
        suggestions: ["Réessayez."],
      },
    }));
    renderPanel({ generateRide });
    await screen.findByText(/Position détectée/);
    await selectTremblant();
    fireEvent.click(screen.getByRole("button", { name: "Générer le trajet" }));
    expect(
      await screen.findByText("Aucun trajet valide n’a pu être trouvé."),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("invalidates confirmed coordinates as soon as the selected text is edited", async () => {
    renderPanel();
    await screen.findByText(/Position détectée/);
    await selectTremblant();
    expect(
      screen.getByRole("button", { name: "Générer le trajet" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("region", { name: "Destination sélectionnée" }),
    ).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("combobox", {
        name: "Adresse, ville ou code postal",
      }),
      { target: { value: "Sherbrooke" } },
    );

    expect(
      screen.getByRole("button", { name: "Générer le trajet" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("region", { name: "Destination sélectionnée" }),
    ).not.toBeInTheDocument();
  });

  it("shows an approximate postal area with an action to adjust its marker", async () => {
    const postal: Place = {
      label: "J2G 2W4, Granby, Québec, Canada",
      name: "J2G 2W4",
      locality: "Granby",
      region: "Québec",
      country: "Canada",
      postalCode: "J2G 2W4",
      type: "postal_code",
      source: "search",
      precision: "approximate",
      coordinates: { latitude: 45.405, longitude: -72.72 },
    };
    renderPanel({ searchPlaces: async () => [postal] });
    await screen.findByText(/Position détectée/);
    fireEvent.change(
      screen.getByRole("combobox", {
        name: "Adresse, ville ou code postal",
      }),
      { target: { value: "j2g2w4" } },
    );
    fireEvent.click(
      await screen.findByRole("option", { name: postal.label }),
    );

    expect(screen.getByText("Emplacement approximatif")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ajuster sur la carte" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Générer le trajet" }),
    ).toBeEnabled();
  });

  it("selects on the map and sends the confirmed marker coordinates to routing", async () => {
    const map = pickerEngine();
    const selectedCoordinates = { latitude: 45.5, longitude: -72.4 };
    const selectedPlace: Place = {
      label: "200 Rue de la Carte, Waterloo",
      name: "200 Rue de la Carte",
      locality: "Waterloo",
      region: "Québec",
      country: "Canada",
      type: "address",
      coordinates: selectedCoordinates,
    };
    const generateRide = vi.fn(
      async (request: GenerateRideRequest): Promise<GenerateRideResult> => {
        void request;
        return { ok: true, route };
      },
    );
    renderPanel({
      destinationMapEngine: map.engine,
      reversePlace: async (coordinates) =>
        coordinates.latitude === granby.coordinates.latitude
          ? { ...granby, coordinates }
          : { ...selectedPlace, coordinates },
      generateRide,
    });
    await screen.findByText(/Position détectée/);
    fireEvent.click(screen.getByRole("button", { name: "Choisir sur la carte" }));
    await waitFor(() => expect(map.engine.mount).toHaveBeenCalled());
    map.pick(selectedCoordinates);
    expect(await screen.findByText(selectedPlace.label)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Utiliser cette destination" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Générer le trajet" }));

    await waitFor(() => expect(generateRide).toHaveBeenCalled());
    expect(generateRide.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        destination: expect.objectContaining({
          coordinates: selectedCoordinates,
          source: "map",
          precision: "exact",
        }),
      }),
    );
  });

  it("cancels map selection without losing the previous destination", async () => {
    const map = pickerEngine();
    renderPanel({
      initialDestination: tremblant,
      initialQuery: tremblant.label,
      destinationMapEngine: map.engine,
      reversePlace: async (coordinates) =>
        coordinates.latitude === granby.coordinates.latitude
          ? { ...granby, coordinates }
          : {
              label: "Nouvelle destination",
              coordinates,
            },
    });
    await screen.findByText(/Position détectée/);
    fireEvent.click(screen.getByRole("button", { name: "Choisir sur la carte" }));
    await waitFor(() => expect(map.engine.mount).toHaveBeenCalled());
    map.pick({ latitude: 45.5, longitude: -72.4 });
    expect(await screen.findByText("Nouvelle destination")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));

    expect(
      screen.getByRole("combobox", {
        name: "Adresse, ville ou code postal",
      }),
    ).toHaveValue("Mont-Tremblant");
    expect(
      screen.getByRole("button", { name: "Générer le trajet" }),
    ).toBeEnabled();
  });
});
