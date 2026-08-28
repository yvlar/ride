import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FindDestinationPanel,
  type FindDestinationPanelProps,
} from "./find-destination-panel";
import { CurrentPositionError } from "@/components/ride-form/browser-geolocation";
import {
  ROUTE_PREFERENCES_STORAGE_KEY,
  writeStoredRoutePreferences,
} from "@/domain/ride/stored-route-preferences";
import type { Place } from "@/domain/geo/types";
import type {
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
    window.localStorage.removeItem(ROUTE_PREFERENCES_STORAGE_KEY);
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
    expect(screen.getByRole("combobox", { name: "Où voulez-vous aller?" })).toHaveValue(
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
});
