import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  DescribeRidePanel,
  type DescribeRidePanelProps,
} from "./describe-ride-panel";
import { CurrentPositionError } from "@/components/ride-form/browser-geolocation";
import { DESCRIBE_DISTANCE_STORAGE_KEY } from "@/domain/ride/describe-distance";
import type { Place } from "@/domain/geo/types";
import type {
  GenerateRideRequest,
  GenerateRideResult,
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

const located = {
  coordinates: granby.coordinates,
  accuracyMeters: 8,
};

function renderPanel(overrides: Partial<DescribeRidePanelProps> = {}) {
  window.localStorage.removeItem(DESCRIBE_DISTANCE_STORAGE_KEY);
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
    expect(screen.queryByLabelText("Point de départ")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ma position" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Durée disponible/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Votre demande")).not.toBeInTheDocument();
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
      }),
      expect.objectContaining({
        useAiWebGeneration: true,
        originAccuracyMeters: 8,
      }),
    );
    expect(screen.getByText(/98\.2 km/)).toBeInTheDocument();
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
        }),
      );
    });
    expect(onGeneratedRouteChange).toHaveBeenLastCalledWith(variant);
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
});
