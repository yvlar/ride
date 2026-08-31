import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FindDestinationPanel,
  type FindDestinationPanelProps,
} from "./find-destination-panel";
import { CurrentPositionError } from "@/components/ride-form/browser-geolocation";
import {
  ROUTE_PREFERENCES_STORAGE_KEY,
  ROUTE_STYLE_STORAGE_KEY,
  writeStoredRoutePreferences,
  writeStoredRouteStyle,
} from "@/domain/ride/stored-route-preferences";
import type { Coordinates, Place } from "@/domain/geo/types";
import type { MapEngine, MapEngineHandlers } from "@/components/map/map-engine";
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

/** Map stub that lets a test drop a pin without MapLibre. */
function stubPickerEngine() {
  let pick: ((coordinates: Coordinates) => void) | undefined;
  const engine: MapEngine = {
    mount: vi.fn((_container, _viewModel, handlers: MapEngineHandlers) => {
      pick = handlers.onPick;
      return {
        destroy: vi.fn(),
        setPickEnabled: vi.fn(),
        setPickMarker: vi.fn(),
      };
    }),
  };
  return {
    engine,
    drop(coordinates: Coordinates) {
      pick?.(coordinates);
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
  fireEvent.change(screen.getByRole("combobox", { name: "Où voulez-vous aller?" }), {
    target: { value: "Mont" },
  });
  fireEvent.click(
    await screen.findByRole("option", { name: "Mont-Tremblant" }),
  );
}

describe("FindDestinationPanel (FR-038)", () => {
  beforeEach(() => {
    window.sessionStorage.removeItem(ROUTE_PREFERENCES_STORAGE_KEY);
    window.sessionStorage.removeItem(ROUTE_STYLE_STORAGE_KEY);
  });

  it("locates automatically and hides origin, distance, and preference controls", async () => {
    renderPanel();

    expect(await screen.findByText(/Position détectée/)).toBeInTheDocument();
    expect(screen.getByText(/12 Rue Principale, Granby/)).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Où voulez-vous aller?" }),
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
      screen.queryByRole("button", { name: "Générer le trajet" }),
    ).not.toBeInTheDocument();
    // Backing out of the pane never depends on choosing a destination first.
    expect(screen.getByRole("button", { name: "Retour" })).toBeEnabled();
  });

  it("reveals generate only once a destination is chosen (FR-038)", async () => {
    renderPanel();
    await screen.findByText(/Position détectée/);
    expect(
      screen.queryByRole("button", { name: "Générer le trajet" }),
    ).not.toBeInTheDocument();

    // Typing alone is not a choice: the button appears with the selection.
    fireEvent.change(
      screen.getByRole("combobox", { name: "Où voulez-vous aller?" }),
      { target: { value: "Mont" } },
    );
    expect(
      screen.queryByRole("button", { name: "Générer le trajet" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      await screen.findByRole("option", { name: "Mont-Tremblant" }),
    );
    expect(
      screen.getByRole("button", { name: "Générer le trajet" }),
    ).toBeEnabled();
  });

  it("hides generate without a destination and disables it without GPS (FR-038)", async () => {
    const { unmount } = renderPanel();
    await screen.findByText(/Position détectée/);
    expect(
      screen.queryByRole("button", { name: "Générer le trajet" }),
    ).not.toBeInTheDocument();
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
    writeStoredRoutePreferences(window.sessionStorage, {
      avoidHighways: false,
      avoidUnpaved: false,
      stayInCanada: true,
    });
    writeStoredRouteStyle(window.sessionStorage, "fastest");
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
        // The destination records how it was chosen (FR-038).
        destination: { ...tremblant, source: "search" },
        style: "fastest",
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
    const { rerender } = renderPanel({
      generateRide,
      regenerateRide,
      onStartNavigation,
      navigationActive: false,
    });
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

    // The host owns the session: the pane follows `navigationActive`.
    rerender(
      <FindDestinationPanel
        requestPosition={async () => located}
        reversePlace={async (coordinates) => ({ ...granby, coordinates })}
        searchPlaces={async () => [tremblant]}
        debounceMs={0}
        onRequestComposed={() => {}}
        onGeneratedRouteChange={() => {}}
        onBack={() => {}}
        generateRide={generateRide}
        regenerateRide={regenerateRide}
        onStartNavigation={onStartNavigation}
        navigationActive
      />,
    );

    expect(screen.getByTestId("destination-flow")).toHaveAttribute(
      "data-destination-flow",
      "navigating",
    );
    expect(
      screen.queryByRole("button", { name: "Démarrer la navigation" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the start action usable when the host declines to navigate (FR-042)", async () => {
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route,
    }));
    const onStartNavigation = vi.fn();
    const { rerender } = renderPanel({
      generateRide,
      onStartNavigation,
      navigationActive: false,
    });
    await screen.findByText(/Position détectée/);
    await selectTremblant();
    fireEvent.click(screen.getByRole("button", { name: "Générer le trajet" }));
    const start = await screen.findByRole("button", {
      name: "Démarrer la navigation",
    });

    fireEvent.click(start);
    expect(onStartNavigation).toHaveBeenCalledTimes(1);

    // The host stayed put (a session was already running and the rider chose
    // to keep it). A re-render must release the debounce lock, not dead-end.
    rerender(
      <FindDestinationPanel
        requestPosition={async () => located}
        reversePlace={async (coordinates) => ({ ...granby, coordinates })}
        searchPlaces={async () => [tremblant]}
        debounceMs={0}
        onRequestComposed={() => {}}
        onGeneratedRouteChange={() => {}}
        onBack={() => {}}
        generateRide={generateRide}
        onStartNavigation={onStartNavigation}
        navigationActive={false}
      />,
    );

    const retry = screen.getByRole("button", {
      name: "Démarrer la navigation",
    });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    expect(onStartNavigation).toHaveBeenCalledTimes(2);
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
    // The previous destination stays visible and editable (FR-038).
    expect(screen.getByTestId("selected-destination")).toHaveTextContent(
      "Mont-Tremblant",
    );
    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    expect(
      screen.getByRole("combobox", { name: "Où voulez-vous aller?" }),
    ).toHaveValue("Mont-Tremblant");
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

    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Où voulez-vous aller?" }), {
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

  it("lets the rider cancel a slow generation and keeps the previous ride (FR-042)", async () => {
    let release: ((result: GenerateRideResult) => void) | null = null;
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route,
    }));
    const regenerateRide = vi.fn(
      () =>
        new Promise<GenerateRideResult>((resolve) => {
          release = resolve;
        }),
    );

    renderPanel({ generateRide, regenerateRide });
    await screen.findByText(/Position détectée/);
    await selectTremblant();
    fireEvent.click(screen.getByRole("button", { name: "Générer le trajet" }));
    await screen.findByRole("button", { name: "Démarrer la navigation" });

    fireEvent.click(screen.getByRole("button", { name: "Régénérer" }));
    const cancel = await screen.findByRole("button", {
      name: "Annuler la génération",
    });

    // The ride already on screen must survive the pending request.
    expect(screen.getByText(/118\.4 km/)).toBeInTheDocument();

    fireEvent.click(cancel);

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Annuler la génération" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "Démarrer la navigation" }),
    ).toBeEnabled();
    expect(screen.getByText(/118\.4 km/)).toBeInTheDocument();

    // A late response for the cancelled request must not replace the preview.
    await act(async () => {
      release?.({ ok: true, route: laterRoute });
    });
    expect(screen.getByText(/118\.4 km/)).toBeInTheDocument();
  });

  it("shows the estimated arrival time in the preview (FR-042)", async () => {
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route,
    }));
    renderPanel({
      generateRide,
      now: () => Date.UTC(2026, 7, 24, 16, 0, 0),
    });
    await screen.findByText(/Position détectée/);
    await selectTremblant();
    fireEvent.click(screen.getByRole("button", { name: "Générer le trajet" }));

    await screen.findByRole("button", { name: "Démarrer la navigation" });
    expect(screen.getByText("arrivée")).toBeInTheDocument();
    expect(screen.getByText(/Vers Mont-Tremblant/)).toBeInTheDocument();
  });

  it("finds a destination by full address, by city and by postal code (FR-038)", async () => {
    const address: Place = {
      label: "125 Rue Principale, Granby, Québec, Canada",
      name: "125 Rue Principale",
      locality: "Granby",
      region: "Québec",
      country: "Canada",
      kind: "address",
      precision: "exact",
      coordinates: { latitude: 45.4008, longitude: -72.7311 },
    };
    const city: Place = {
      label: "Roxton Pond, Québec, Canada",
      name: "Roxton Pond",
      locality: "Roxton Pond",
      region: "Québec",
      country: "Canada",
      kind: "city",
      precision: "approximate",
      coordinates: { latitude: 45.4833, longitude: -72.6333 },
    };
    const postal: Place = {
      label: "J2G 2W4, Granby, Québec, Canada",
      name: "J2G 2W4",
      locality: "Granby",
      region: "Québec",
      postalCode: "J2G 2W4",
      country: "Canada",
      kind: "postal_code",
      precision: "approximate",
      coordinates: { latitude: 45.4004, longitude: -72.7325 },
    };
    const byQuery: Record<string, Place[]> = {
      "125 rue Principale, Granby": [address],
      "Roxton Pond": [city],
      "j2g 2w4": [postal],
    };

    renderPanel({
      searchPlaces: async (query: string) => byQuery[query] ?? [],
    });
    await screen.findByText(/Position détectée/);

    const field = () =>
      screen.getByRole("combobox", { name: "Où voulez-vous aller?" });

    for (const [query, expected] of Object.entries(byQuery)) {
      fireEvent.change(field(), { target: { value: query } });
      const option = await screen.findByRole("option", {
        name: expected[0]!.label,
      });
      // The type of each result is visible in the list.
      expect(option).toHaveTextContent(
        expected[0]!.kind === "address"
          ? "Adresse"
          : expected[0]!.kind === "city"
            ? "Ville"
            : "Code postal",
      );
      fireEvent.click(option);

      expect(screen.getByTestId("selected-destination")).toHaveTextContent(
        expected[0]!.name!,
      );
      fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    }
  });

  it("distinguishes two municipalities that share a name (FR-032, FR-038)", async () => {
    const granbyQc: Place = {
      label: "Granby, Québec, Canada",
      name: "Granby",
      locality: "Granby",
      region: "Québec",
      country: "Canada",
      kind: "city",
      precision: "approximate",
      coordinates: { latitude: 45.4001, longitude: -72.7342 },
    };
    const granbyCo: Place = {
      label: "Granby, Colorado, États-Unis",
      name: "Granby",
      locality: "Granby",
      region: "Colorado",
      country: "États-Unis",
      kind: "city",
      precision: "approximate",
      coordinates: { latitude: 40.0866, longitude: -105.9372 },
    };

    renderPanel({ searchPlaces: async () => [granbyQc, granbyCo] });
    await screen.findByText(/Position détectée/);
    fireEvent.change(
      screen.getByRole("combobox", { name: "Où voulez-vous aller?" }),
      { target: { value: "Granby" } },
    );

    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("Québec");
    expect(options[0]).toHaveTextContent("Canada");
    expect(options[1]).toHaveTextContent("Colorado");
    expect(options[1]).toHaveTextContent("États-Unis");
    // Neither is preselected: the rider must choose (FR-032).
    expect(options[0]).toHaveAttribute("aria-selected", "false");
    expect(options[1]).toHaveAttribute("aria-selected", "false");
    expect(
      screen.queryByTestId("selected-destination"),
    ).not.toBeInTheDocument();
  });

  it("marks an approximate postal-code destination and offers to adjust it (FR-038)", async () => {
    const postal: Place = {
      label: "J2G, Granby, Québec, Canada",
      name: "J2G 2W4",
      locality: "Granby",
      region: "Québec",
      postalCode: "J2G 2W4",
      country: "Canada",
      kind: "postal_code",
      precision: "approximate",
      coordinates: { latitude: 45.4004, longitude: -72.7325 },
    };

    renderPanel({ searchPlaces: async () => [postal] });
    await screen.findByText(/Position détectée/);
    fireEvent.change(
      screen.getByRole("combobox", { name: "Où voulez-vous aller?" }),
      { target: { value: "J2G2W4" } },
    );
    fireEvent.click(await screen.findByRole("option", { name: postal.label }));

    const card = screen.getByTestId("selected-destination");
    expect(card).toHaveAttribute("data-precision", "approximate");
    expect(card).toHaveTextContent("Emplacement approximatif");
    expect(
      screen.getByRole("button", { name: "Ajuster sur la carte" }),
    ).toBeEnabled();
  });

  it("invalidates the destination as soon as the text changes (FR-038)", async () => {
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route,
    }));
    renderPanel({ generateRide });
    await screen.findByText(/Position détectée/);
    await selectTremblant();
    expect(
      screen.getByRole("button", { name: "Générer le trajet" }),
    ).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    fireEvent.change(
      screen.getByRole("combobox", { name: "Où voulez-vous aller?" }),
      { target: { value: "Mont-Trembl" } },
    );

    // The stale coordinates must never be reused silently.
    expect(
      screen.queryByRole("button", { name: "Générer le trajet" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("selected-destination"),
    ).not.toBeInTheDocument();
    expect(generateRide).not.toHaveBeenCalled();
  });

  it("picks a destination on the map and sends its coordinates to routing (FR-038)", async () => {
    const picked = { latitude: 45.9, longitude: -73.1 };
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route,
    }));
    const map = stubPickerEngine();

    renderPanel({
      generateRide,
      mapEngine: map.engine,
      reversePlace: async (coordinates) => ({ ...granby, coordinates }),
    });
    await screen.findByText(/Position détectée/);

    fireEvent.click(
      screen.getByRole("button", { name: "Choisir sur la carte" }),
    );
    expect(await screen.findByTestId("destination-map-picker")).toBeInTheDocument();

    map.drop(picked);
    fireEvent.click(
      await screen.findByRole("button", { name: "Utiliser cette destination" }),
    );

    await waitFor(() => {
      expect(
        screen.queryByTestId("destination-map-picker"),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("selected-destination")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Générer le trajet" }));
    await waitFor(() => expect(generateRide).toHaveBeenCalledTimes(1));

    const request = generateRide.mock.calls.at(0)?.at(0) as unknown as
      GenerateRideRequest & { destination: Place; start: Place };
    expect(request.destination.coordinates).toEqual(picked);
    expect(request.destination.source).toBe("map");
    expect(request.start.coordinates).toEqual(located.coordinates);
  });

  it("keeps the previous destination when the map picker is cancelled (FR-038)", async () => {
    const map = stubPickerEngine();
    renderPanel({ mapEngine: map.engine });
    await screen.findByText(/Position détectée/);
    await selectTremblant();
    expect(screen.getByTestId("selected-destination")).toHaveTextContent(
      "Mont-Tremblant",
    );

    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Choisir sur la carte" }),
    );
    await screen.findByTestId("destination-map-picker");
    map.drop({ latitude: 40, longitude: -100 });
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));

    await waitFor(() => {
      expect(
        screen.queryByTestId("destination-map-picker"),
      ).not.toBeInTheDocument();
    });
    // Cancelling discards the draft, never the confirmed destination.
    expect(screen.getByTestId("selected-destination")).toHaveTextContent(
      "Mont-Tremblant",
    );
    expect(
      screen.getByRole("button", { name: "Générer le trajet" }),
    ).toBeEnabled();
  });

  it("clears the destination and hides generation (FR-038)", async () => {
    renderPanel();
    await screen.findByText(/Position détectée/);
    await selectTremblant();

    fireEvent.click(
      screen.getByRole("button", { name: "Effacer la destination" }),
    );

    expect(
      screen.queryByTestId("selected-destination"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Où voulez-vous aller?" }),
    ).toHaveValue("");
    expect(
      screen.queryByRole("button", { name: "Générer le trajet" }),
    ).not.toBeInTheDocument();
  });
});
