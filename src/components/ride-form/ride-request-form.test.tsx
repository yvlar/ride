import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Place } from "@/domain/geo/types";
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
import type {
  GenerateRideRequest,
  GenerateRideResult,
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

function okGenerateRide(): (
  request: GenerateRideRequest,
) => Promise<GenerateRideResult> {
  return vi.fn(async () => ({ ok: true, route: generatedLoop }));
}

function renderForm(props: Partial<RideRequestFormProps> = {}) {
  return render(
    <RideRequestForm
      searchPlaces={searchPlaces}
      debounceMs={0}
      generateRide={okGenerateRide()}
      {...props}
    />,
  );
}

describe("RideRequestForm (FR-014)", () => {
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
    fireEvent.click(screen.getByRole("radio", { name: "Courbes" }));
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
    fireEvent.click(screen.getByRole("radio", { name: "Touring" }));
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
    fireEvent.click(screen.getByRole("radio", { name: "Courbes" }));
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

  it("toggles route preferences (FR-007, FR-008)", async () => {
    const onRequestComposed = vi.fn();
    renderForm({ onRequestComposed });

    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.change(targetDistanceField(), {
      target: { value: "150" },
    });
    fireEvent.click(screen.getByLabelText("Éviter les autoroutes"));
    fireEvent.click(screen.getByLabelText("Éviter les routes non pavées"));
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    await waitFor(() => {
      expect(onRequestComposed).toHaveBeenCalledWith(
        expect.objectContaining({
          preferences: { avoidHighways: true, avoidUnpaved: true },
        }),
      );
    });
  });
});
