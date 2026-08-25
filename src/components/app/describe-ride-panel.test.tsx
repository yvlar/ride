import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DescribeRidePanel } from "./describe-ride-panel";
import type { Place } from "@/domain/geo/types";
import type {
  GenerateRideRequest,
  GenerateRideResult,
  GeneratedLoopRoute,
} from "@/domain/ride/types";
import { CurrentPositionError } from "@/components/ride-form/browser-geolocation";

const granby: Place = {
  label: "Granby, QC",
  coordinates: { latitude: 45.4001, longitude: -72.7342 },
};

const loop: GeneratedLoopRoute = {
  id: "route-1",
  type: "loop",
  start: granby,
  targetDistanceKm: 250,
  style: "curvy",
  geometry: {
    type: "LineString",
    coordinates: [
      [-72.7342, 45.4001],
      [-72.7, 45.45],
    ],
  },
  segments: [],
  distanceKm: 248.2,
  durationMinutes: 180,
  statistics: { repeatedRoadPercent: 3 },
  warnings: [],
};

const variant: GeneratedLoopRoute = {
  ...loop,
  id: "route-2",
  distanceKm: 252.4,
};

async function searchPlaces(query: string): Promise<Place[]> {
  return query.toLowerCase().includes("granby") ? [granby] : [];
}

function fillLoopDescription() {
  fireEvent.change(screen.getByLabelText("Votre demande"), {
    target: {
      value:
        "Crée une boucle de 250 km au départ de Granby, avec des routes sinueuses, sans autoroute et uniquement asphaltées.",
    },
  });
}

describe("DescribeRidePanel (FR-034)", () => {
  it("generates in place from Continuer without opening the planner (FR-011)", async () => {
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route: loop,
    }));
    const onRequestComposed = vi.fn();
    const onGeneratedRouteChange = vi.fn();
    const onStartNavigation = vi.fn();

    render(
      <DescribeRidePanel
        searchPlaces={searchPlaces}
        debounceMs={0}
        generateRide={generateRide}
        onRequestComposed={onRequestComposed}
        onGeneratedRouteChange={onGeneratedRouteChange}
        onStartNavigation={onStartNavigation}
        onBack={() => {}}
      />,
    );

    fillLoopDescription();
    expect(screen.getByRole("radio", { name: "Routes sinueuses" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByLabelText("Éviter les autoroutes")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Continuer avec ces critères" }));

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
        targetDistanceKm: 250,
        style: "curvy",
      }),
    );
    expect(onGeneratedRouteChange).toHaveBeenCalledWith(loop);
    expect(generateRide).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("group", { name: "Actions du trajet" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Guidage vocal (activé)")).toBeInTheDocument();
  });

  it("blocks a second Continuer click while generation is in flight", async () => {
    let resolveGenerate: ((value: GenerateRideResult) => void) | undefined;
    const generateRide = vi.fn(
      () =>
        new Promise<GenerateRideResult>((resolve) => {
          resolveGenerate = resolve;
        }),
    );

    render(
      <DescribeRidePanel
        searchPlaces={searchPlaces}
        debounceMs={0}
        generateRide={generateRide}
        onRequestComposed={() => {}}
        onGeneratedRouteChange={() => {}}
        onStartNavigation={() => {}}
        onBack={() => {}}
      />,
    );

    fillLoopDescription();
    const continueButton = screen.getByRole("button", {
      name: "Continuer avec ces critères",
    });
    fireEvent.click(continueButton);
    fireEvent.click(continueButton);
    fireEvent.click(continueButton);

    await waitFor(() => {
      expect(generateRide).toHaveBeenCalledTimes(1);
    });
    expect(continueButton).toBeDisabled();
    expect(screen.getByText("Génération du trajet…")).toBeInTheDocument();

    resolveGenerate?.({ ok: true, route: loop });
    expect(
      await screen.findByRole("button", { name: "Démarrer la navigation" }),
    ).toBeEnabled();
  });

  it("regenerates with the same criteria and replaces only a successful variant (FR-012, BR-006)", async () => {
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

    render(
      <DescribeRidePanel
        searchPlaces={searchPlaces}
        debounceMs={0}
        generateRide={generateRide}
        regenerateRide={regenerateRide}
        onRequestComposed={onRequestComposed}
        onGeneratedRouteChange={onGeneratedRouteChange}
        onStartNavigation={() => {}}
        onBack={() => {}}
      />,
    );

    fillLoopDescription();
    fireEvent.click(screen.getByRole("button", { name: "Continuer avec ces critères" }));
    await screen.findByRole("button", { name: "Régénérer" });

    const composed = onRequestComposed.mock.calls[0]?.[0] as GenerateRideRequest;

    fireEvent.click(screen.getByRole("button", { name: "Régénérer" }));
    await waitFor(() => {
      expect(regenerateRide).toHaveBeenCalledWith(composed, loop);
    });
    expect(onGeneratedRouteChange).toHaveBeenLastCalledWith(variant);
  });

  it("keeps the previous route when regeneration fails (FR-012, FR-021)", async () => {
    const onGeneratedRouteChange = vi.fn();
    const regenerateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: false,
      error: {
        code: "NO_ROUTE_FOUND",
        message: "Aucune autre route n’a pu être calculée.",
        suggestions: ["Réessayez."],
      },
    }));

    render(
      <DescribeRidePanel
        searchPlaces={searchPlaces}
        debounceMs={0}
        generateRide={async () => ({ ok: true, route: loop })}
        regenerateRide={regenerateRide}
        onRequestComposed={() => {}}
        onGeneratedRouteChange={onGeneratedRouteChange}
        onStartNavigation={() => {}}
        onBack={() => {}}
      />,
    );

    fillLoopDescription();
    fireEvent.click(screen.getByRole("button", { name: "Continuer avec ces critères" }));
    await screen.findByRole("button", { name: "Régénérer" });
    onGeneratedRouteChange.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Régénérer" }));
    expect(
      await screen.findByText("Aucune autre route n’a pu être calculée."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeEnabled();
    expect(onGeneratedRouteChange).not.toHaveBeenCalled();
    expect(screen.getByText(/248\.2 km/)).toBeInTheDocument();
  });

  it("does not replace stored criteria when a later Continuer fails (FR-012, FR-021)", async () => {
    const generateRide = vi
      .fn<
        (
          request: GenerateRideRequest,
        ) => Promise<GenerateRideResult>
      >()
      .mockResolvedValueOnce({ ok: true, route: loop })
      .mockResolvedValue({
        ok: false,
        error: {
          code: "NO_ROUTE_FOUND",
          message: "Aucun trajet n’a pu être calculé.",
          suggestions: ["Réessayez."],
        },
      });
    const regenerateRide = vi.fn();
    const onRequestComposed = vi.fn();
    const onGeneratedRouteChange = vi.fn();

    render(
      <DescribeRidePanel
        searchPlaces={searchPlaces}
        debounceMs={0}
        generateRide={generateRide}
        regenerateRide={regenerateRide}
        onRequestComposed={onRequestComposed}
        onGeneratedRouteChange={onGeneratedRouteChange}
        onStartNavigation={() => {}}
        onBack={() => {}}
      />,
    );

    fillLoopDescription();
    fireEvent.click(screen.getByRole("button", { name: "Continuer avec ces critères" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Modifier les critères" }),
    );
    fireEvent.change(screen.getByLabelText("Distance cible (km)"), {
      target: { value: "80" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuer avec ces critères" }));

    expect(
      await screen.findByText("Aucun trajet n’a pu être calculé."),
    ).toBeInTheDocument();
    expect(screen.getByText(/248\.2 km/)).toBeInTheDocument();
    expect(screen.getByText(/boucle d’environ 250 km/i)).toBeInTheDocument();
    expect(onRequestComposed).toHaveBeenCalledTimes(1);
    expect(onGeneratedRouteChange).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => {
      expect(generateRide).toHaveBeenCalledTimes(3);
    });
    expect(generateRide).toHaveBeenLastCalledWith(
      expect.objectContaining({ targetDistanceKm: 80 }),
    );
    expect(regenerateRide).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Régénérer" }));
    await waitFor(() => {
      expect(regenerateRide).toHaveBeenCalledWith(
        expect.objectContaining({ targetDistanceKm: 250 }),
        loop,
      );
    });
  });

  it("starts navigation with the displayed route and does not regenerate (FR-023)", async () => {
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route: loop,
    }));
    const regenerateRide = vi.fn();
    const onStartNavigation = vi.fn();

    render(
      <DescribeRidePanel
        searchPlaces={searchPlaces}
        debounceMs={0}
        generateRide={generateRide}
        regenerateRide={regenerateRide}
        onRequestComposed={() => {}}
        onGeneratedRouteChange={() => {}}
        onStartNavigation={onStartNavigation}
        onBack={() => {}}
      />,
    );

    fillLoopDescription();
    fireEvent.click(screen.getByRole("button", { name: "Continuer avec ces critères" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Démarrer la navigation" }),
    );

    expect(onStartNavigation).toHaveBeenCalledTimes(1);
    expect(regenerateRide).not.toHaveBeenCalled();
    expect(generateRide).toHaveBeenCalledTimes(1);
  });

  it("shows a location permission message from Ma position (FR-017, FR-033)", async () => {
    render(
      <DescribeRidePanel
        searchPlaces={searchPlaces}
        debounceMs={0}
        requestCoordinates={async () => {
          throw new CurrentPositionError("permission_denied");
        }}
        reversePlace={async () => granby}
        onRequestComposed={() => {}}
        onGeneratedRouteChange={() => {}}
        onStartNavigation={() => {}}
        onBack={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ma position" }));
    expect(
      await screen.findByText(new CurrentPositionError("permission_denied").message),
    ).toBeInTheDocument();
  });
});
