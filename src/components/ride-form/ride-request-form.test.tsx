import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Place } from "@/domain/geo/types";
import { RideRequestForm } from "./ride-request-form";

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

    fireEvent.change(screen.getByLabelText("Distance cible (km)"), {
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
    fireEvent.change(screen.getByLabelText("Distance cible (km)"), {
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

  it("requires a destination for a point-to-point ride (FR-002, FR-018)", async () => {
    render(<RideRequestForm searchPlaces={searchPlaces} debounceMs={0} />);

    await selectPlace("Point de départ", "Granby, QC");
    fireEvent.click(screen.getByRole("radio", { name: /Destination/ }));
    fireEvent.click(screen.getByRole("button", { name: "Générer ma ride" }));

    expect(screen.getByText("Indiquez une destination.")).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText("Distance cible (km)"), {
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
