import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Place } from "@/domain/geo/types";
import {
  TARGET_DISTANCE_HINT_OPTIONAL,
  TARGET_DISTANCE_HINT_OPTIONAL_WITH_DURATION,
  TARGET_DISTANCE_HINT_REQUIRED,
  TARGET_DISTANCE_POSITIVE_KM_MESSAGE,
  TARGET_DISTANCE_REQUIRED_MESSAGE,
} from "@/domain/ride/target-distance";
import { RideRequestForm } from "./ride-request-form";

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

describe("RideRequestForm (FR-014)", () => {
  it("hides destination for a loop and shows it for a destination ride (FR-018)", () => {
    render(<RideRequestForm searchPlaces={searchPlaces} debounceMs={0} />);

    expect(
      screen.queryByRole("combobox", { name: "Destination" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /Destination/ }));

    expect(
      screen.getByRole("combobox", { name: "Destination" }),
    ).toBeInTheDocument();
  });

  it("validates a missing start before generating (FR-017)", () => {
    render(<RideRequestForm searchPlaces={searchPlaces} debounceMs={0} />);

    fireEvent.change(targetDistanceField(), {
      target: { value: "200" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    expect(screen.getByText("Indiquez un point de départ.")).toBeInTheDocument();
  });

  it("lets the user compose a loop and submit the request (FR-001, FR-011, FR-019)", async () => {
    const onRequestComposed = vi.fn();
    render(
      <RideRequestForm
        searchPlaces={searchPlaces}
        debounceMs={0}
        onRequestComposed={onRequestComposed}
      />,
    );

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
    expect(
      screen.getByRole("status"),
    ).toHaveTextContent(/boucle d’environ 200 km au départ de Granby, QC/i);
  });

  it("lets the user compose a round trip with a destination (FR-003, FR-018)", async () => {
    const onRequestComposed = vi.fn();
    render(
      <RideRequestForm
        searchPlaces={searchPlaces}
        debounceMs={0}
        onRequestComposed={onRequestComposed}
      />,
    );

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
    render(<RideRequestForm searchPlaces={searchPlaces} debounceMs={0} />);

    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.click(screen.getByRole("radio", { name: /Destination/ }));
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    expect(screen.getByText("Indiquez une destination.")).toBeInTheDocument();
  });

  it("requires a loop target distance in kilometres when no duration is set (FR-009)", async () => {
    render(<RideRequestForm searchPlaces={searchPlaces} debounceMs={0} />);

    expect(screen.getByText(TARGET_DISTANCE_HINT_REQUIRED)).toBeInTheDocument();
    expect(targetDistanceField()).toHaveAttribute("aria-required", "true");

    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    expect(screen.getByText(TARGET_DISTANCE_REQUIRED_MESSAGE)).toBeInTheDocument();
  });

  it("makes the loop target distance optional once a duration is provided (FR-009)", async () => {
    const onRequestComposed = vi.fn();
    render(
      <RideRequestForm
        searchPlaces={searchPlaces}
        debounceMs={0}
        onRequestComposed={onRequestComposed}
      />,
    );

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
    expect(onRequestComposed.mock.calls[0][0].targetDistanceKm).toBeGreaterThan(
      0,
    );
  });

  it("keeps the target distance optional for a destination ride (FR-009)", async () => {
    const onRequestComposed = vi.fn();
    render(
      <RideRequestForm
        searchPlaces={searchPlaces}
        debounceMs={0}
        onRequestComposed={onRequestComposed}
      />,
    );

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
    render(
      <RideRequestForm
        searchPlaces={searchPlaces}
        debounceMs={0}
        onRequestComposed={onRequestComposed}
      />,
    );

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
    render(<RideRequestForm searchPlaces={searchPlaces} debounceMs={0} />);

    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.change(targetDistanceField(), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    expect(
      screen.getByText(TARGET_DISTANCE_POSITIVE_KM_MESSAGE),
    ).toBeInTheDocument();
  });

  it("toggles route preferences (FR-007, FR-008)", async () => {
    const onRequestComposed = vi.fn();
    render(
      <RideRequestForm
        searchPlaces={searchPlaces}
        debounceMs={0}
        onRequestComposed={onRequestComposed}
      />,
    );

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
