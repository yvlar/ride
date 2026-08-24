import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GPS_TRACKING_UNAVAILABLE_MESSAGE } from "@/components/map/geolocate-control-options";
import type { Place } from "@/domain/geo/types";
import { CURRENT_POSITION_FALLBACK_LABEL } from "@/infrastructure/geocoding/labels";
import { CurrentPositionError } from "./browser-geolocation";
import { CURRENT_POSITION_ADDRESS_UNAVAILABLE_MESSAGE } from "./reverse-geocode-place";
import {
  AVAILABLE_DURATION_HINT,
  AVAILABLE_DURATION_POSITIVE_MESSAGE,
} from "@/domain/ride/duration";
import {
  TARGET_DISTANCE_HINT_OPTIONAL,
  TARGET_DISTANCE_HINT_OPTIONAL_WITH_DURATION,
  TARGET_DISTANCE_HINT_REQUIRED,
  TARGET_DISTANCE_POSITIVE_KM_MESSAGE,
  TARGET_DISTANCE_REQUIRED_MESSAGE,
} from "@/domain/ride/target-distance";
import {
  MAP_UNAVAILABLE_MESSAGE,
  type MapEngine,
} from "@/components/map/map-engine";
import type {
  GenerateRideRequest,
  GenerateRideResult,
  GeneratedDestinationRoute,
  GeneratedLoopRoute,
} from "@/domain/ride/types";
import { RideRequestForm, type RideRequestFormProps } from "./ride-request-form";

const targetDistanceField = () =>
  screen.getByLabelText(/Distance cible \(km\)/);

const granby: Place = {
  label: "Granby, QC",
  coordinates: { latitude: 45.4001, longitude: -72.7342 },
};

const tremblant: Place = {
  label: "Mont-Tremblant, QC",
  coordinates: { latitude: 46.1185, longitude: -74.5962 },
};

async function searchPlaces(query: string): Promise<Place[]> {
  const needle = query.toLowerCase();
  return [granby, tremblant].filter((place) =>
    place.label.toLowerCase().includes(needle),
  );
}

async function selectPlace(label: string, query: string) {
  fireEvent.change(screen.getByRole("combobox", { name: label }), {
    target: { value: query },
  });
  fireEvent.click(await screen.findByRole("option", { name: query }));
}

function stubMapEngine(): MapEngine {
  return {
    mount: vi.fn(() => ({ destroy: vi.fn() })),
  };
}

const generatedLoop: GeneratedLoopRoute = {
  id: "route-1",
  type: "loop",
  start: granby,
  targetDistanceKm: 200,
  style: "curvy",
  geometry: {
    type: "LineString",
    coordinates: [
      [-72.7342, 45.4001],
      [-72.7, 45.45],
    ],
  },
  segments: [],
  distanceKm: 198.4,
  durationMinutes: 150,
  statistics: { repeatedRoadPercent: 4 },
  warnings: ["Certains segments ont une surface inconnue."],
};

const generatedDestination: GeneratedDestinationRoute = {
  id: "route-dest",
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
  distanceKm: 140.2,
  durationMinutes: 110,
  warnings: [],
};

function okGenerateRide(): (
  request: GenerateRideRequest,
) => Promise<GenerateRideResult> {
  return vi.fn(async (): Promise<GenerateRideResult> => ({
    ok: true,
    route: generatedLoop,
  }));
}

function renderForm(props: Partial<RideRequestFormProps> = {}) {
  return render(
    <RideRequestForm
      searchPlaces={searchPlaces}
      debounceMs={0}
      generateRide={okGenerateRide()}
      mapEngine={stubMapEngine()}
      {...props}
    />,
  );
}

describe("RideRequestForm (FR-014)", () => {
  it("does not request GPS automatically on load (FR-017, FR-022)", () => {
    const requestCoordinates = vi.fn();
    renderForm({ requestCoordinates, reversePlace: vi.fn() });

    expect(screen.getByRole("button", { name: "Ma position" })).toBeEnabled();
    expect(requestCoordinates).not.toHaveBeenCalled();
  });

  it("fills the start field with the reverse-geocoded address (FR-017)", async () => {
    const coordinates = { latitude: 45.4001, longitude: -72.7342 };
    const onRequestComposed = vi.fn();
    renderForm({
      onRequestComposed,
      requestCoordinates: async () => coordinates,
      reversePlace: async () => ({
        label: "12 Rue Principale, Granby",
        coordinates,
      }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Ma position" }));

    expect(
      await screen.findByText("Lieu sélectionné : 12 Rue Principale, Granby"),
    ).toBeInTheDocument();
    fireEvent.change(targetDistanceField(), { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    await waitFor(() => {
      expect(onRequestComposed).toHaveBeenCalledWith(
        expect.objectContaining({
          start: {
            label: "12 Rue Principale, Granby",
            coordinates,
          },
        }),
      );
    });
  });

  it("keeps the current position when reverse geocoding fails (FR-017)", async () => {
    const coordinates = { latitude: 45.4001, longitude: -72.7342 };
    const onRequestComposed = vi.fn();
    renderForm({
      onRequestComposed,
      requestCoordinates: async () => coordinates,
      reversePlace: async () => {
        throw new Error("unavailable");
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Ma position" }));

    expect(
      await screen.findByText(`Lieu sélectionné : ${CURRENT_POSITION_FALLBACK_LABEL}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(CURRENT_POSITION_ADDRESS_UNAVAILABLE_MESSAGE),
    ).toBeInTheDocument();

    fireEvent.change(targetDistanceField(), { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    await waitFor(() => {
      expect(onRequestComposed).toHaveBeenCalledWith(
        expect.objectContaining({
          start: {
            label: CURRENT_POSITION_FALLBACK_LABEL,
            coordinates,
          },
        }),
      );
    });
    expect(
      screen.getByRole("region", { name: "Trajet généré" }),
    ).toBeInTheDocument();
  });

  it("shows the selected start address on the composition screen (FR-017)", async () => {
    renderForm();

    await selectPlace("Point de départ", "Granby, QC");

    expect(
      screen.getByText("Lieu sélectionné : Granby, QC"),
    ).toBeInTheDocument();
  });

  it("exposes a single primary generate action", () => {
    renderForm();

    const generate = screen.getAllByRole("button", { name: "Générer ma ride" });
    expect(generate).toHaveLength(1);
    expect(generate[0]).toHaveAttribute("type", "submit");
  });

  it("uses large radio controls for type and style instead of select lists (NFR-001)", () => {
    renderForm();

    expect(document.querySelector("select")).toBeNull();
    expect(screen.getByRole("radio", { name: /Boucle/ })).toHaveClass(
      "min-h-12",
    );
    expect(screen.getByRole("radio", { name: "Routes sinueuses" })).toHaveClass(
      "min-h-12",
    );
    expect(screen.getByRole("radio", { name: "Panoramique" })).toHaveClass(
      "min-h-12",
    );
    expect(screen.getByRole("radio", { name: "Équilibré" })).toHaveClass(
      "min-h-12",
    );
  });

  it("hides destination for a loop and shows it for a destination ride (FR-018)", () => {
    renderForm();

    expect(
      screen.queryByRole("combobox", { name: "Destination" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /Destination/ }));

    expect(
      screen.getByRole("combobox", { name: "Destination" }),
    ).toBeInTheDocument();
  });

  it("validates a missing start before generating (FR-017)", () => {
    const generateRide = okGenerateRide();
    renderForm({ generateRide });

    fireEvent.change(targetDistanceField(), {
      target: { value: "200" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    expect(screen.getByText("Indiquez un point de départ.")).toBeInTheDocument();
    expect(generateRide).not.toHaveBeenCalled();
  });

  it("lets the user compose a loop and generate one primary ride (FR-001, FR-011, FR-019)", async () => {
    const onRequestComposed = vi.fn();
    const generateRide = okGenerateRide();
    renderForm({ onRequestComposed, generateRide });

    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.change(targetDistanceField(), {
      target: { value: "200" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Routes sinueuses" }));
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    await waitFor(() => {
      expect(onRequestComposed).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "loop",
          start: granby,
          targetDistanceKm: 200,
          style: "curvy",
        }),
      );
    });
    expect(generateRide).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "loop",
        start: granby,
        targetDistanceKm: 200,
        style: "curvy",
      }),
      { useKnowledgeRouting: false },
    );
    expect(
      screen.getByRole("status"),
    ).toHaveTextContent(/boucle d’environ 200 km au départ de Granby, QC/i);
    const generated = screen.getByRole("region", { name: "Trajet généré" });
    expect(generated).toHaveTextContent("198.4 km");
    expect(generated).toHaveTextContent("150 min");
    expect(generated).toHaveTextContent(
      "Certains segments ont une surface inconnue.",
    );
    const map = screen.getByRole("region", { name: "Carte du trajet" });
    expect(map).toHaveTextContent("Sens : boucle depuis Granby, QC");
    expect(map).toHaveTextContent("Départ : Granby, QC");
    expect(map).not.toHaveTextContent("Destination :");
  });

  it("shows the generated route on a map with start and destination (FR-013)", async () => {
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route: generatedDestination,
    }));
    renderForm({ generateRide });

    fireEvent.click(screen.getByRole("radio", { name: /Destination/ }));
    await selectPlace("Point de départ", "Granby, QC");
    await selectPlace("Destination", "Mont-Tremblant, QC");
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    const generated = await screen.findByRole("region", { name: "Trajet généré" });
    expect(generated).toHaveTextContent("140.2 km");
    expect(generated).toHaveTextContent("110 min");
    const map = screen.getByRole("region", { name: "Carte du trajet" });
    expect(map).toHaveTextContent("Départ : Granby, QC");
    expect(map).toHaveTextContent("Destination : Mont-Tremblant, QC");
    expect(map).toHaveTextContent("Sens : Granby, QC → Mont-Tremblant, QC");
  });

  it("keeps textual results when the map engine fails (FR-013)", async () => {
    const mapEngine: MapEngine = {
      mount: (_container, _viewModel, { onError }) => {
        onError(MAP_UNAVAILABLE_MESSAGE);
        return { destroy() {} };
      },
    };
    renderForm({ mapEngine });

    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.change(targetDistanceField(), {
      target: { value: "200" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    const generated = await screen.findByRole("region", { name: "Trajet généré" });
    expect(generated).toHaveTextContent("198.4 km");
    expect(generated).toHaveTextContent("150 min");
    expect(generated).toHaveTextContent(
      "Certains segments ont une surface inconnue.",
    );
    expect(await screen.findByText(MAP_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
    expect(generated).toHaveTextContent("198.4 km");
  });

  it("keeps the generated route when Ma position later fails (FR-013, FR-022)", async () => {
    const requestCoordinates = vi.fn(async () => {
      throw new CurrentPositionError("permission_denied");
    });
    renderForm({ requestCoordinates });

    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.change(targetDistanceField(), {
      target: { value: "200" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    const generated = await screen.findByRole("region", { name: "Trajet généré" });
    expect(generated).toHaveTextContent("198.4 km");
    expect(generated).toHaveTextContent("150 min");

    fireEvent.click(screen.getByRole("button", { name: "Ma position" }));

    expect(
      await screen.findByText(new CurrentPositionError("permission_denied").message),
    ).toBeInTheDocument();
    expect(generated).toHaveTextContent("198.4 km");
    expect(generated).toHaveTextContent("150 min");
    expect(generated).toHaveTextContent(
      "Certains segments ont une surface inconnue.",
    );
    expect(generated).toHaveTextContent("position définie (Granby, QC)");
    expect(requestCoordinates).toHaveBeenCalledTimes(1);
  });

  it("keeps textual results when GPS tracking fails (FR-022)", async () => {
    const mapEngine: MapEngine = {
      mount: (_container, _viewModel, { onWarning }) => {
        onWarning?.(GPS_TRACKING_UNAVAILABLE_MESSAGE);
        return { destroy() {} };
      },
    };
    renderForm({ mapEngine });

    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.change(targetDistanceField(), {
      target: { value: "200" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    const generated = await screen.findByRole("region", { name: "Trajet généré" });
    expect(generated).toHaveTextContent("198.4 km");
    expect(generated).toHaveTextContent("150 min");
    expect(generated).toHaveTextContent(
      "Certains segments ont une surface inconnue.",
    );
    expect(
      await screen.findByText(GPS_TRACKING_UNAVAILABLE_MESSAGE),
    ).toBeInTheDocument();
    expect(generated).toHaveTextContent("198.4 km");
  });

  it("ignores a stale generation after the ride type changes (FR-011)", async () => {
    let resolveGeneration: (value: GenerateRideResult) => void = () => {};
    const generateRide = vi.fn(
      () =>
        new Promise<GenerateRideResult>((resolve) => {
          resolveGeneration = resolve;
        }),
    );
    renderForm({ generateRide });

    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.change(targetDistanceField(), {
      target: { value: "200" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    expect(
      await screen.findByRole("button", { name: "Génération…" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("radio", { name: /Destination/ }));
    resolveGeneration({ ok: true, route: generatedLoop });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Générer ma ride" }),
      ).toBeEnabled();
    });
    expect(
      screen.queryByRole("region", { name: "Trajet généré" }),
    ).not.toBeInTheDocument();
  });

  it("ignores a stale generation after the target distance changes while pending (FR-011)", async () => {
    let resolveGeneration: (value: GenerateRideResult) => void = () => {};
    const generateRide = vi.fn(
      () =>
        new Promise<GenerateRideResult>((resolve) => {
          resolveGeneration = resolve;
        }),
    );
    renderForm({ generateRide });

    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.change(targetDistanceField(), {
      target: { value: "200" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    expect(
      await screen.findByRole("button", { name: "Génération…" }),
    ).toBeDisabled();

    fireEvent.change(targetDistanceField(), {
      target: { value: "80" },
    });
    resolveGeneration({ ok: true, route: generatedLoop });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Générer ma ride" }),
      ).toBeEnabled();
    });
    expect(
      screen.queryByRole("region", { name: "Trajet généré" }),
    ).not.toBeInTheDocument();
    expect(targetDistanceField()).toHaveValue("80");
  });

  it("shows a provider error when generation throws (FR-011)", async () => {
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => {
      throw new Error("network down");
    });
    renderForm({ generateRide });

    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.change(targetDistanceField(), {
      target: { value: "200" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Le service de cartographie ne répond pas/,
    );
    expect(
      screen.getByRole("button", { name: "Générer ma ride" }),
    ).toBeEnabled();
  });

  it("shows an explicit business error when generation fails (FR-011)", async () => {
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: false,
      error: {
        code: "DISTANCE_OUT_OF_TOLERANCE",
        message:
          "Aucun trajet ne respecte ±10 % de 200.0 km (BR-001). Le meilleur candidat fait 400.0 km.",
        suggestions: ["Ajustez la distance cible."],
        bestCandidate: { distanceKm: 400 },
      },
    }));
    renderForm({ generateRide });

    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.change(targetDistanceField(), {
      target: { value: "200" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent(/Aucun trajet ne respecte ±10 %/);
    expect(screen.getByText("Ajustez la distance cible.")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Trajet généré" }),
    ).not.toBeInTheDocument();
  });

  it("lets the user compose a round trip with a destination (FR-003, FR-018)", async () => {
    const onRequestComposed = vi.fn();
    renderForm({ onRequestComposed });

    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.click(screen.getByRole("radio", { name: /Aller-retour/ }));
    await selectPlace("Destination", "Mont-Tremblant, QC");
    fireEvent.click(screen.getByRole("radio", { name: "Équilibré" }));
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    await waitFor(() => {
      expect(onRequestComposed).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "round_trip",
          start: granby,
          destination: tremblant,
          style: "touring",
        }),
      );
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      /aller-retour au départ de Granby, QC vers Mont-Tremblant, QC/i,
    );
  });

  it("requires a destination for a point-to-point ride (FR-002, FR-018)", async () => {
    renderForm();

    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.click(screen.getByRole("radio", { name: /Destination/ }));
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    expect(screen.getByText("Indiquez une destination.")).toBeInTheDocument();
  });

  it("requires a loop target distance in kilometres when no duration is set (FR-009)", async () => {
    renderForm();

    expect(screen.getByText(TARGET_DISTANCE_HINT_REQUIRED)).toBeInTheDocument();
    expect(targetDistanceField()).toHaveAttribute("aria-required", "true");

    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    expect(screen.getByText(TARGET_DISTANCE_REQUIRED_MESSAGE)).toBeInTheDocument();
  });

  it("makes the loop target distance optional once a duration is provided (FR-009)", async () => {
    const onRequestComposed = vi.fn();
    renderForm({ onRequestComposed });

    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.change(screen.getByLabelText("Durée disponible (h)"), {
      target: { value: "3" },
    });

    expect(
      screen.getByText(TARGET_DISTANCE_HINT_OPTIONAL_WITH_DURATION),
    ).toBeInTheDocument();
    expect(targetDistanceField()).toHaveAttribute("aria-required", "false");

    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    await waitFor(() => {
      expect(onRequestComposed).toHaveBeenCalled();
    });
    expect(
      onRequestComposed.mock.calls[0][0].targetDistanceKm,
    ).toBeUndefined();
    expect(
      onRequestComposed.mock.calls[0][0].availableDurationMinutes,
    ).toBe(180);
  });

  it("keeps the target distance optional for a destination ride (FR-009)", async () => {
    const onRequestComposed = vi.fn();
    renderForm({ onRequestComposed });

    fireEvent.click(screen.getByRole("radio", { name: /Destination/ }));
    expect(screen.getByText(TARGET_DISTANCE_HINT_OPTIONAL)).toBeInTheDocument();
    expect(targetDistanceField()).toHaveAttribute("aria-required", "false");

    await selectPlace("Point de départ", "Granby, QC");
    await selectPlace("Destination", "Mont-Tremblant, QC");
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    await waitFor(() => {
      expect(onRequestComposed).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "destination",
          targetDistanceKm: undefined,
        }),
      );
    });
  });

  it("accepts an optional destination target distance in kilometres (FR-009)", async () => {
    const onRequestComposed = vi.fn();
    renderForm({ onRequestComposed });

    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.click(screen.getByRole("radio", { name: /Destination/ }));
    await selectPlace("Destination", "Mont-Tremblant, QC");
    fireEvent.change(targetDistanceField(), {
      target: { value: "220" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    await waitFor(() => {
      expect(onRequestComposed).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "destination",
          targetDistanceKm: 220,
        }),
      );
    });
  });

  it("rejects a non-positive target distance and keeps the unit explicit (FR-009)", async () => {
    renderForm();

    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.change(targetDistanceField(), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    expect(
      screen.getByText(TARGET_DISTANCE_POSITIVE_KM_MESSAGE),
    ).toBeInTheDocument();
  });

  it("lets the user compose a loop from an available duration (FR-010)", async () => {
    const onRequestComposed = vi.fn();
    renderForm({ onRequestComposed });

    expect(screen.getByText(AVAILABLE_DURATION_HINT)).toBeInTheDocument();

    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.change(screen.getByLabelText("Durée disponible (h)"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Routes sinueuses" }));
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    await waitFor(() => {
      expect(onRequestComposed).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "loop",
          availableDurationMinutes: 120,
          targetDistanceKm: undefined,
        }),
      );
    });
  });

  it("keeps an explicit distance when a duration is also provided (FR-010)", async () => {
    const onRequestComposed = vi.fn();
    renderForm({ onRequestComposed });

    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.change(targetDistanceField(), {
      target: { value: "250" },
    });
    fireEvent.change(screen.getByLabelText("Durée disponible (h)"), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    await waitFor(() => {
      expect(onRequestComposed).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "loop",
          targetDistanceKm: 250,
          availableDurationMinutes: 240,
        }),
      );
    });
  });

  it("rejects a non-positive available duration (FR-010)", async () => {
    renderForm();

    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.change(targetDistanceField(), {
      target: { value: "80" },
    });
    fireEvent.change(screen.getByLabelText("Durée disponible (h)"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    expect(
      screen.getByText(AVAILABLE_DURATION_POSITIVE_MESSAGE),
    ).toBeInTheDocument();
  });

  it("starts navigation only after the user action and uses one GPS watch (FR-022, FR-023, NFR-006)", async () => {
    const listeners = new Set<(event: { type: string }) => void>();
    const unsubscribe = vi.fn(() => {
      listeners.clear();
    });
    const locationWatch = {
      start: vi.fn(),
      subscribe: vi.fn((listener) => {
        listeners.add(listener);
        return unsubscribe;
      }),
      activeNativeWatches: () => listeners.size,
    };
    const speech = {
      available: true,
      speak: vi.fn(),
      cancel: vi.fn(),
      setMuted: vi.fn(),
      unlock: vi.fn(),
    };
    const destroyPreviewMap = vi.fn();
    const setGeolocateEnabled = vi.fn();
    const mountPreviewMap = vi.fn(() => ({
      destroy: destroyPreviewMap,
      setUserLocation: vi.fn(),
      recenter: vi.fn(),
      setViewModel: vi.fn(),
      resize: vi.fn(),
      setGeolocateEnabled,
    }));
    renderForm({
      mapEngine: { mount: mountPreviewMap },
      navigation: {
        locationWatch,
        speech,
      },
    });

    expect(locationWatch.subscribe).not.toHaveBeenCalled();
    expect(speech.speak).not.toHaveBeenCalled();

    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.change(targetDistanceField(), { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    const start = await screen.findByRole("button", {
      name: "Démarrer la navigation",
    });
    expect(locationWatch.subscribe).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(mountPreviewMap).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(setGeolocateEnabled).toHaveBeenCalled();
    });
    fireEvent.click(start);
    expect(mountPreviewMap).toHaveBeenCalledTimes(1);
    expect(destroyPreviewMap).not.toHaveBeenCalled();
    expect(setGeolocateEnabled).toHaveBeenCalledWith(false);
    const disableOrder = setGeolocateEnabled.mock.invocationCallOrder.find(
      (_, index) => setGeolocateEnabled.mock.calls[index]?.[0] === false,
    );
    const startOrder = locationWatch.start.mock.invocationCallOrder[0];
    expect(disableOrder).toBeDefined();
    expect(startOrder).toBeDefined();
    expect(disableOrder!).toBeLessThan(startOrder!);
    expect(locationWatch.start).toHaveBeenCalledTimes(1);
    expect(speech.unlock).toHaveBeenCalledTimes(1);
    expect(locationWatch.subscribe).toHaveBeenCalledTimes(1);
    const dialog = screen.getByRole("dialog", { name: "Navigation" });
    expect(dialog).toBeInTheDocument();
    expect(dialog.closest("[data-slot=card]")).toBeNull();
    expect(document.body.contains(dialog)).toBe(true);
    expect(document.querySelector("form")).toHaveAttribute("inert");
    expect(
      screen.getByRole("region", { name: "Carte du trajet", hidden: true }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Carte de navigation" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Arrêter" }));
    fireEvent.click(screen.getByRole("button", { name: "Terminer" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Navigation" }),
      ).not.toBeInTheDocument();
    });
    expect(unsubscribe).toHaveBeenCalled();
    expect(setGeolocateEnabled).toHaveBeenLastCalledWith(true);
    expect(destroyPreviewMap).not.toHaveBeenCalled();
    expect(
      screen.getByRole("region", { name: "Carte du trajet" }),
    ).toBeInTheDocument();
  });

  it("toggles route preferences (FR-007, FR-008, FR-030)", async () => {
    const onRequestComposed = vi.fn();
    renderForm({ onRequestComposed });

    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.change(targetDistanceField(), {
      target: { value: "150" },
    });
    fireEvent.click(screen.getByLabelText("Éviter les autoroutes"));
    fireEvent.click(screen.getByLabelText("Éviter les routes non pavées"));
    fireEvent.click(screen.getByLabelText("Canada seulement"));
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    await waitFor(() => {
      expect(onRequestComposed).toHaveBeenCalledWith(
        expect.objectContaining({
          preferences: {
            avoidHighways: true,
            avoidUnpaved: true,
            stayInCanada: true,
          },
        }),
      );
    });
  });

  it("sends the RAG knowledge option when Corridors RAG is on (FR-029)", async () => {
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route: generatedLoop,
    }));
    renderForm({ generateRide });

    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.change(targetDistanceField(), {
      target: { value: "150" },
    });
    expect(screen.getByLabelText("Corridors RAG")).not.toBeChecked();
    expect(
      screen.getByText(/Classement des corridors par ChatGPT \(clé API serveur\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/réseau routier configuré/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Corridors RAG"));
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    await waitFor(() => {
      expect(generateRide).toHaveBeenCalledWith(
        expect.objectContaining({ type: "loop" }),
        { useKnowledgeRouting: true },
      );
    });
    const firstCall = generateRide.mock.calls[0] as unknown as
      | [GenerateRideRequest, { useKnowledgeRouting?: boolean }]
      | undefined;
    expect(firstCall?.[0]).toBeDefined();
    expect(firstCall?.[0]).not.toHaveProperty("useKnowledgeRouting");
  });

  it("omits the RAG option by default (FR-029)", async () => {
    const generateRide = vi.fn(async (): Promise<GenerateRideResult> => ({
      ok: true,
      route: generatedLoop,
    }));
    renderForm({ generateRide });

    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.change(targetDistanceField(), {
      target: { value: "150" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    await waitFor(() => {
      expect(generateRide).toHaveBeenCalledWith(expect.anything(), {
        useKnowledgeRouting: false,
      });
    });
  });

  it("collapses the composer after a successful generation (FR-015, FR-033)", async () => {
    renderForm();
    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.change(targetDistanceField(), { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    expect(
      await screen.findByRole("button", { name: "Démarrer la navigation" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Générer ma ride" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Modifier la demande" }),
    ).toBeEnabled();
    expect(screen.getByText(/GPS : position définie/)).toBeInTheDocument();
  });

  it("shows unsupported styles and preferences as disabled (FR-019)", () => {
    renderForm();
    expect(screen.getByRole("button", { name: /Rapide/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Aventure/ })).toBeDisabled();
    expect(screen.getByLabelText("Éviter les péages")).toBeDisabled();
    expect(screen.getByLabelText("Éviter les traversiers")).toBeDisabled();
    expect(
      screen.getByLabelText("Chemins non asphaltés autorisés"),
    ).toBeEnabled();
  });
});
