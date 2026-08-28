import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  DescribeRidePanel,
  type DescribeRidePanelProps,
} from "./describe-ride-panel";
import { CurrentPositionError } from "@/components/ride-form/browser-geolocation";
import { DESCRIBE_DISTANCE_STORAGE_KEY } from "@/domain/ride/describe-distance";
import { DESCRIBE_LOOP_STORAGE_KEY } from "@/domain/ride/describe-loop";
import {
  ROUTE_PREFERENCES_STORAGE_KEY,
  writeStoredRoutePreferences,
} from "@/domain/ride/stored-route-preferences";
import type { Place } from "@/domain/geo/types";
import type {
  GenerateRideRequest,
  GenerateRideResult,
  GeneratedDestinationRoute,
  GeneratedLoopRoute,
} from "@/domain/ride/types";

const granby: Place = {
  label: "Position actuelle",
  coordinates: { latitude: 45.4001, longitude: -72.7342 },
};

const loop: GeneratedLoopRoute = {
  id: "route-1",
  type: "loop",
  start: granby,
  targetDistanceKm: 100,
  style: "scenic",
  geometry: {
    type: "LineString",
    coordinates: [
      [-72.7342, 45.4001],
      [-72.7, 45.45],
    ],
  },
  segments: [],
  distanceKm: 98.2,
  durationMinutes: 90,
  statistics: { repeatedRoadPercent: 3 },
  warnings: [],
};

const variant: GeneratedLoopRoute = {
  ...loop,
  id: "route-2",
  distanceKm: 102.4,
};

const arrival: Place = {
  label: "Arrivée proposée",
  coordinates: { latitude: 45.52, longitude: -72.51 },
};

const oneWay: GeneratedDestinationRoute = {
  id: "route-one-way",
  type: "destination",
  start: granby,
  destination: arrival,
  style: "scenic",
  targetDistanceKm: 100,
  geometry: {
    type: "LineString",
    coordinates: [
      [-72.7342, 45.4001],
      [-72.51, 45.52],
    ],
  },
  segments: [],
  distanceKm: 97.4,
  durationMinutes: 88,
  warnings: [],
};

const oneWayVariant: GeneratedDestinationRoute = {
  ...oneWay,
  id: "route-one-way-2",
  destination: {
    label: "Arrivée proposée",
    coordinates: { latitude: 45.48, longitude: -72.9 },
  },
  distanceKm: 101.1,
};

const located = {
  coordinates: granby.coordinates,
  accuracyMeters: 8,
};

function renderPanel(overrides: Partial<DescribeRidePanelProps> = {}) {
  window.localStorage.removeItem(DESCRIBE_DISTANCE_STORAGE_KEY);
  window.localStorage.removeItem(DESCRIBE_LOOP_STORAGE_KEY);
  window.localStorage.removeItem(ROUTE_PREFERENCES_STORAGE_KEY);
  return render(
    <DescribeRidePanel
      requestPosition={async () => located}
      onRequestComposed={() => {}}
      onGeneratedRouteChange={() => {}}
      onStartNavigation={() => {}}
      onBack={() => {}}
      {...overrides}
    />,
  );
}

describe("DescribeRidePanel (FR-034)", () => {
  it("shows a 20–500 km slider and live distance, without origin or duration", async () => {
    renderPanel();

    const slider = await screen.findByRole("slider", {
      name: "Distance du trajet en kilomètres",
    });
    expect(slider).toHaveAttribute("aria-valuemin", "20");
    expect(slider).toHaveAttribute("aria-valuemax", "500");
    expect(slider).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByText("100 km")).toBeInTheDocument();
    expect(screen.getByLabelText("Boucle")).toBeChecked();
    expect(screen.queryByLabelText("Point de départ")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ma position" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Durée disponible/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Votre demande")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Éviter les autoroutes")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Éviter les routes non pavées"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Canada seulement")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continuer avec ces critères" }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByText("Position détectée"),
    ).toBeInTheDocument();
  });

  it("updates the displayed distance from the slider", async () => {
    renderPanel();
    const slider = await screen.findByRole("slider", {
      name: "Distance du trajet en kilomètres",
    });
    fireEvent.change(slider, { target: { value: "180" } });
    expect(screen.getByText("180 km")).toBeInTheDocument();
    expect(slider).toHaveAttribute("aria-valuenow", "180");
  });

  it("locates automatically and sends an AI web-generation request (FR-011)", async () => {
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route: loop,
    }));
    const requestPosition = vi.fn(async () => located);
    const onRequestComposed = vi.fn();
    const onGeneratedRouteChange = vi.fn();

    renderPanel({
      generateRide,
      requestPosition,
      onRequestComposed,
      onGeneratedRouteChange,
    });

    await screen.findByText("Position détectée");
    expect(requestPosition).toHaveBeenCalled();
    fireEvent.change(
      screen.getByRole("slider", { name: "Distance du trajet en kilomètres" }),
      { target: { value: "180" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Générer mon trajet" }));

    expect(
      await screen.findByRole("button", { name: "Démarrer la navigation" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Régénérer" })).toBeEnabled();
    expect(
      screen.queryByRole("heading", { name: "Composer le trajet" }),
    ).not.toBeInTheDocument();
    expect(onRequestComposed).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "loop",
        start: granby,
        targetDistanceKm: 180,
      }),
    );
    expect(onRequestComposed.mock.calls[0]?.[0]).not.toHaveProperty(
      "availableDurationMinutes",
    );
    expect(onGeneratedRouteChange).toHaveBeenCalledWith(loop);
    expect(generateRide).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "loop",
        targetDistanceKm: 180,
        preferences: {
          avoidHighways: true,
          avoidUnpaved: true,
          stayInCanada: false,
        },
      }),
      expect.objectContaining({
        useAiWebGeneration: true,
        originAccuracyMeters: 8,
        returnToStart: true,
      }),
    );
    expect(screen.getByText(/98\.2 km/)).toBeInTheDocument();
  });

  it("applies route preferences stored in Réglages at generation (FR-007, FR-008, FR-030, FR-031)", async () => {
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route: loop,
    }));
    renderPanel({ generateRide });
    await screen.findByText("Position détectée");
    writeStoredRoutePreferences(window.localStorage, {
      avoidHighways: false,
      avoidUnpaved: false,
      stayInCanada: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Générer mon trajet" }));

    await waitFor(() => {
      expect(generateRide).toHaveBeenCalledWith(
        expect.objectContaining({
          preferences: {
            avoidHighways: false,
            avoidUnpaved: false,
            stayInCanada: true,
          },
        }),
        expect.objectContaining({ useAiWebGeneration: true }),
      );
    });
  });

  it("sends returnToStart false when Boucle is off (FR-034)", async () => {
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route: loop,
    }));
    renderPanel({ generateRide });
    await screen.findByText("Position détectée");
    fireEvent.click(screen.getByLabelText("Boucle"));
    expect(screen.getByLabelText("Boucle")).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Générer mon trajet" }));

    await waitFor(() => {
      expect(generateRide).toHaveBeenCalledWith(
        expect.objectContaining({ type: "loop" }),
        expect.objectContaining({
          useAiWebGeneration: true,
          returnToStart: false,
        }),
      );
    });
  });

  it("blocks a second generate click while the AI request is in flight", async () => {
    let resolveGenerate: ((value: GenerateRideResult) => void) | undefined;
    const generateRide = vi.fn(
      () =>
        new Promise<GenerateRideResult>((resolve) => {
          resolveGenerate = resolve;
        }),
    );

    renderPanel({ generateRide });
    await screen.findByText("Position détectée");
    const generateButton = screen.getByRole("button", {
      name: "Générer mon trajet",
    });
    fireEvent.click(generateButton);
    fireEvent.click(generateButton);
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(generateRide).toHaveBeenCalledTimes(1);
    });
    expect(generateButton).toBeDisabled();
    expect(
      screen.getAllByText("L’IA prépare votre trajet moto…").length,
    ).toBeGreaterThan(0);

    resolveGenerate?.({ ok: true, route: loop });
    expect(
      await screen.findByRole("button", { name: "Démarrer la navigation" }),
    ).toBeEnabled();
  });

  it("regenerates a different corridor without clearing the current route (FR-012, BR-006)", async () => {
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route: loop,
    }));
    const regenerateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route: variant,
    }));
    const onGeneratedRouteChange = vi.fn();
    const onRequestComposed = vi.fn();

    renderPanel({
      generateRide,
      regenerateRide,
      onGeneratedRouteChange,
      onRequestComposed,
    });

    await screen.findByText("Position détectée");
    fireEvent.click(screen.getByRole("button", { name: "Générer mon trajet" }));
    await screen.findByRole("button", { name: "Régénérer" });
    const composed = onRequestComposed.mock.calls[0]?.[0] as GenerateRideRequest;

    fireEvent.click(screen.getByRole("button", { name: "Régénérer" }));
    await waitFor(() => {
      expect(regenerateRide).toHaveBeenCalledWith(
        composed,
        loop,
        expect.objectContaining({
          useAiWebGeneration: true,
          previousRouteSignature: expect.any(String),
          returnToStart: true,
        }),
      );
    });
    expect(onGeneratedRouteChange).toHaveBeenLastCalledWith(variant);
  });

  it("regenerates a one-way with a matching destination envelope (FR-012, FR-034)", async () => {
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route: oneWay,
    }));
    const regenerateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route: oneWayVariant,
    }));
    const onGeneratedRouteChange = vi.fn();
    const onRequestComposed = vi.fn();

    renderPanel({
      generateRide,
      regenerateRide,
      onGeneratedRouteChange,
      onRequestComposed,
    });

    await screen.findByText("Position détectée");
    fireEvent.click(screen.getByLabelText("Boucle"));
    fireEvent.click(screen.getByRole("button", { name: "Générer mon trajet" }));
    await screen.findByRole("button", { name: "Régénérer" });
    const composed = onRequestComposed.mock.calls[0]?.[0] as GenerateRideRequest;
    expect(composed).toMatchObject({
      type: "destination",
      destination: arrival,
      targetDistanceKm: 100,
    });

    fireEvent.click(screen.getByRole("button", { name: "Régénérer" }));
    await waitFor(() => {
      expect(regenerateRide).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "destination",
          destination: arrival,
          targetDistanceKm: 100,
        }),
        oneWay,
        expect.objectContaining({
          useAiWebGeneration: true,
          returnToStart: false,
          previousRouteSignature: expect.any(String),
        }),
      );
    });
    expect(onGeneratedRouteChange).toHaveBeenLastCalledWith(oneWayVariant);
  });

  it("starts a new generate when Boucle no longer matches the current route (FR-034)", async () => {
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route: loop,
    }));
    const regenerateRide = vi.fn();

    renderPanel({ generateRide, regenerateRide });
    await screen.findByText("Position détectée");
    fireEvent.click(screen.getByRole("button", { name: "Générer mon trajet" }));
    await screen.findByRole("button", { name: "Régénérer" });
    fireEvent.click(screen.getByLabelText("Boucle"));
    generateRide.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Régénérer" }));
    await waitFor(() => {
      expect(generateRide).toHaveBeenCalledWith(
        expect.objectContaining({ type: "loop" }),
        expect.objectContaining({
          useAiWebGeneration: true,
          returnToStart: false,
        }),
      );
    });
    expect(regenerateRide).not.toHaveBeenCalled();
  });

  it("refreshes GPS before generate and regenerate (FR-034)", async () => {
    const moved = {
      coordinates: { latitude: 45.51, longitude: -72.81 },
      accuracyMeters: 5,
    };
    let current = located;
    const requestPosition = vi.fn(async () => current);
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route: loop,
    }));
    const regenerateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route: variant,
    }));

    renderPanel({ generateRide, regenerateRide, requestPosition });
    await screen.findByText("Position détectée");
    expect(requestPosition).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Générer mon trajet" }));
    await screen.findByRole("button", { name: "Régénérer" });
    expect(requestPosition).toHaveBeenCalledTimes(2);
    expect(generateRide).toHaveBeenCalledWith(
      expect.objectContaining({ start: granby }),
      expect.objectContaining({ originAccuracyMeters: 8 }),
    );

    current = moved;
    fireEvent.click(screen.getByRole("button", { name: "Régénérer" }));
    await waitFor(() => {
      expect(regenerateRide).toHaveBeenCalledWith(
        expect.objectContaining({
          start: {
            label: "Position actuelle",
            coordinates: moved.coordinates,
          },
        }),
        loop,
        expect.objectContaining({ originAccuracyMeters: 5 }),
      );
    });
    expect(requestPosition).toHaveBeenCalledTimes(3);
  });

  it("does not regenerate with a stale start when location fails (FR-034)", async () => {
    let fail = false;
    const requestPosition = vi.fn(async () => {
      if (fail) {
        throw new CurrentPositionError("position_unavailable");
      }
      return located;
    });
    const regenerateRide = vi.fn();

    renderPanel({
      generateRide: async () => ({ ok: true, route: loop }),
      regenerateRide,
      requestPosition,
    });
    await screen.findByText("Position détectée");
    fireEvent.click(screen.getByRole("button", { name: "Générer mon trajet" }));
    await screen.findByRole("button", { name: "Régénérer" });
    fail = true;
    fireEvent.click(screen.getByRole("button", { name: "Régénérer" }));

    expect(
      await screen.findByText("La position actuelle est indisponible."),
    ).toBeInTheDocument();
    expect(regenerateRide).not.toHaveBeenCalled();
    expect(screen.getByText(/98\.2 km/)).toBeInTheDocument();
  });

  it("keeps the previous route when regeneration fails (FR-012, FR-021)", async () => {
    const onGeneratedRouteChange = vi.fn();
    const regenerateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: false,
      error: {
        code: "NO_ROUTE_FOUND",
        message: "Aucun trajet valide n’a pu être trouvé.",
        suggestions: ["Réessayez."],
      },
    }));

    renderPanel({
      generateRide: async () => ({ ok: true, route: loop }),
      regenerateRide,
      onGeneratedRouteChange,
    });

    await screen.findByText("Position détectée");
    fireEvent.click(screen.getByRole("button", { name: "Générer mon trajet" }));
    await screen.findByRole("button", { name: "Régénérer" });
    onGeneratedRouteChange.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Régénérer" }));
    expect(
      await screen.findByText("Aucun trajet valide n’a pu être trouvé."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeEnabled();
    expect(onGeneratedRouteChange).not.toHaveBeenCalled();
    expect(screen.getByText(/98\.2 km/)).toBeInTheDocument();
  });

  it("starts navigation with the displayed route and does not regenerate (FR-023)", async () => {
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route: loop,
    }));
    const regenerateRide = vi.fn();
    const onStartNavigation = vi.fn();

    renderPanel({
      generateRide,
      regenerateRide,
      onStartNavigation,
    });

    await screen.findByText("Position détectée");
    fireEvent.click(screen.getByRole("button", { name: "Générer mon trajet" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Démarrer la navigation" }),
    );

    expect(onStartNavigation).toHaveBeenCalledTimes(1);
    expect(regenerateRide).not.toHaveBeenCalled();
    expect(generateRide).toHaveBeenCalledTimes(1);
  });

  it("explains a denied location permission and offers retry (FR-034)", async () => {
    renderPanel({
      requestPosition: async () => {
        throw new CurrentPositionError("permission_denied");
      },
    });

    expect(
      await screen.findByText("L’autorisation de localisation a été refusée."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Réessayer la localisation" }),
    ).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Ma position" })).not.toBeInTheDocument();
  });

  it("explains an unavailable position (FR-034)", async () => {
    renderPanel({
      requestPosition: async () => {
        throw new CurrentPositionError("position_unavailable");
      },
    });

    expect(
      await screen.findByText("La position actuelle est indisponible."),
    ).toBeInTheDocument();
  });

  it("requests location from Générer when a fix is not ready yet", async () => {
    let resolveLocate: ((value: typeof located) => void) | undefined;
    const pending = new Promise<typeof located>((resolve) => {
      resolveLocate = resolve;
    });
    const requestPosition = vi.fn(async () => pending);
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route: loop,
    }));

    renderPanel({ requestPosition, generateRide });
    fireEvent.click(screen.getByRole("button", { name: "Générer mon trajet" }));
    expect(screen.getByText("Recherche de la position…")).toBeInTheDocument();
    resolveLocate?.(located);

    expect(
      await screen.findByRole("button", { name: "Démarrer la navigation" }),
    ).toBeEnabled();
    expect(generateRide).toHaveBeenCalled();
  });

  it("does not let a stale mount GPS overwrite the generate fix (FR-034)", async () => {
    const moved = {
      coordinates: { latitude: 45.51, longitude: -72.81 },
      accuracyMeters: 5,
    };
    const resolvers: Array<(value: typeof located) => void> = [];
    const requestPosition = vi.fn(
      () =>
        new Promise<typeof located>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const generateRide = vi.fn(
      async (request: GenerateRideRequest): Promise<GenerateRideResult> => ({
        ok: true,
        route: { ...loop, start: request.start },
      }),
    );
    const onRequestComposed = vi.fn();

    renderPanel({ requestPosition, generateRide, onRequestComposed });
    await waitFor(() => expect(requestPosition).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Recherche de la position…")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Générer mon trajet" }));
    await waitFor(() => expect(requestPosition).toHaveBeenCalledTimes(2));

    resolvers[1]?.(moved);

    await waitFor(() => {
      expect(generateRide).toHaveBeenCalledWith(
        expect.objectContaining({
          start: {
            label: "Position actuelle",
            coordinates: moved.coordinates,
          },
        }),
        expect.objectContaining({ originAccuracyMeters: 5 }),
      );
    });
    expect(
      await screen.findByRole("button", { name: "Démarrer la navigation" }),
    ).toBeEnabled();

    resolvers[0]?.(located);

    await waitFor(() => {
      const status = screen.getByText("Position détectée");
      expect(status).toHaveAttribute(
        "data-start-latitude",
        String(moved.coordinates.latitude),
      );
      expect(status).toHaveAttribute(
        "data-start-longitude",
        String(moved.coordinates.longitude),
      );
    });
    expect(onRequestComposed).toHaveBeenCalledWith(
      expect.objectContaining({
        start: expect.objectContaining({ coordinates: moved.coordinates }),
      }),
    );
    expect(generateRide).toHaveBeenCalledTimes(1);
  });

  it("does not apply a stale mount locate error after generate already has a fix (FR-034)", async () => {
    const moved = {
      coordinates: { latitude: 45.51, longitude: -72.81 },
      accuracyMeters: 5,
    };
    let rejectMount: ((reason: unknown) => void) | undefined;
    let resolveGenerateLocate: ((value: typeof located) => void) | undefined;
    const requestPosition = vi.fn(
      () =>
        new Promise<typeof located>((resolve, reject) => {
          if (rejectMount === undefined) {
            rejectMount = reject;
            return;
          }
          resolveGenerateLocate = resolve;
        }),
    );
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route: loop,
    }));

    renderPanel({ requestPosition, generateRide });
    await waitFor(() => expect(requestPosition).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Générer mon trajet" }));
    await waitFor(() => expect(requestPosition).toHaveBeenCalledTimes(2));

    resolveGenerateLocate?.(moved);
    expect(
      await screen.findByRole("button", { name: "Démarrer la navigation" }),
    ).toBeEnabled();
    expect(generateRide).toHaveBeenCalledWith(
      expect.objectContaining({
        start: {
          label: "Position actuelle",
          coordinates: moved.coordinates,
        },
      }),
      expect.objectContaining({ originAccuracyMeters: 5 }),
    );

    rejectMount?.(new CurrentPositionError("permission_denied"));

    await waitFor(() => {
      expect(screen.getByText("Position détectée")).toBeInTheDocument();
    });
    expect(
      screen.queryByText("L’autorisation de localisation a été refusée."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Réessayer la localisation" }),
    ).not.toBeInTheDocument();
  });

  it("restores the last chosen distance from storage", async () => {
    window.localStorage.setItem(DESCRIBE_DISTANCE_STORAGE_KEY, "180");
    render(
      <DescribeRidePanel
        requestPosition={async () => located}
        onRequestComposed={() => {}}
        onGeneratedRouteChange={() => {}}
        onStartNavigation={() => {}}
        onBack={() => {}}
      />,
    );
    const slider = await screen.findByRole("slider", {
      name: "Distance du trajet en kilomètres",
    });
    expect(slider).toHaveAttribute("aria-valuenow", "180");
    expect(screen.getByText("180 km")).toBeInTheDocument();
  });

  it("retries location after a denial (FR-034)", async () => {
    let denied = true;
    const requestPosition = vi.fn(async () => {
      if (denied) {
        throw new CurrentPositionError("permission_denied");
      }
      return located;
    });
    renderPanel({ requestPosition });
    expect(
      await screen.findByText("L’autorisation de localisation a été refusée."),
    ).toBeInTheDocument();
    denied = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Réessayer la localisation" }),
    );
    expect(await screen.findByText("Position détectée")).toBeInTheDocument();
  });

  it("shows a clear retry when web search is unavailable (FR-034)", async () => {
    renderPanel({
      generateRide: async () => ({
        ok: false,
        error: {
          code: "WEB_SEARCH_UNAVAILABLE",
          message: "La recherche Web est indisponible.",
          suggestions: ["Réessayez."],
        },
      }),
    });
    await screen.findByText("Position détectée");
    fireEvent.click(screen.getByRole("button", { name: "Générer mon trajet" }));
    expect(
      await screen.findByText("La recherche Web est indisponible."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Démarrer la navigation" }),
    ).not.toBeInTheDocument();
  });

  it("shows a clear retry when the AI service is unavailable (FR-034)", async () => {
    renderPanel({
      generateRide: async () => ({
        ok: false,
        error: {
          code: "AI_UNAVAILABLE",
          message: "Le service d’IA est indisponible.",
          suggestions: ["Réessayez."],
        },
      }),
    });
    await screen.findByText("Position détectée");
    fireEvent.click(screen.getByRole("button", { name: "Générer mon trajet" }));
    expect(
      await screen.findByText("Le service d’IA est indisponible."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeEnabled();
  });

  it("shows a clear retry when the routing engine is unavailable (FR-034)", async () => {
    renderPanel({
      generateRide: async () => ({
        ok: false,
        error: {
          code: "ROUTING_UNAVAILABLE",
          message: "Le moteur de routage est indisponible.",
          suggestions: ["Réessayez."],
        },
      }),
    });
    await screen.findByText("Position détectée");
    fireEvent.click(screen.getByRole("button", { name: "Générer mon trajet" }));
    expect(
      await screen.findByText("Le moteur de routage est indisponible."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeEnabled();
  });

  it("lets the rider cancel a slow regeneration and keeps the ride on screen (FR-041)", async () => {
    let release: ((result: GenerateRideResult) => void) | undefined;
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route: loop,
    }));
    const regenerateRide = vi.fn(
      () =>
        new Promise<GenerateRideResult>((resolve) => {
          release = resolve;
        }),
    );

    renderPanel({ generateRide, regenerateRide });
    await screen.findByText("Position détectée");
    fireEvent.click(screen.getByRole("button", { name: "Générer mon trajet" }));
    await screen.findByRole("button", { name: "Démarrer la navigation" });

    fireEvent.click(screen.getByRole("button", { name: "Régénérer" }));
    const cancel = await screen.findByRole("button", {
      name: "Annuler la génération",
    });
    expect(screen.getByText(/98\.2 km/)).toBeInTheDocument();

    fireEvent.click(cancel);

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Annuler la génération" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "Démarrer la navigation" }),
    ).toBeEnabled();

    // The abandoned response must not overwrite the ride the rider kept.
    release!({ ok: true, route: variant });
    await waitFor(() => {
      expect(screen.getByText(/98\.2 km/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/102\.4 km/)).not.toBeInTheDocument();
  });

  it("shows distance, duration and arrival time for the generated ride (FR-041)", async () => {
    renderPanel({
      generateRide: async (): Promise<GenerateRideResult> => ({
        ok: true,
        route: loop,
      }),
      now: () => Date.UTC(2026, 7, 24, 16, 0, 0),
    });
    await screen.findByText("Position détectée");
    fireEvent.click(screen.getByRole("button", { name: "Générer mon trajet" }));

    await screen.findByRole("button", { name: "Démarrer la navigation" });
    expect(screen.getByText("distance")).toBeInTheDocument();
    expect(screen.getByText("durée")).toBeInTheDocument();
    expect(screen.getByText("arrivée")).toBeInTheDocument();
  });
});
