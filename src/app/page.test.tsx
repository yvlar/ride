import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Home from "./page";

describe("Home (FR-014)", () => {
  it("presents the composition screen with every required control (NFR-001, NFR-002)", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "Générateur de trajets moto" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/départ, d’une distance ou d’une destination/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/variantes/i)).not.toBeInTheDocument();

    expect(
      screen.getByRole("combobox", { name: "Point de départ" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ma position" })).toBeEnabled();

    expect(screen.getByRole("radio", { name: /Boucle/ })).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /Destination/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /Aller-retour/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Destination" }),
    ).not.toBeInTheDocument();

    expect(screen.getByLabelText(/Distance cible \(km\)/)).toBeInTheDocument();
    expect(
      screen.getByLabelText("Durée disponible (h)"),
    ).toBeInTheDocument();

    expect(screen.getByRole("radio", { name: "Courbes" })).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Panoramique" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Touring" })).toBeInTheDocument();

    expect(
      screen.getByLabelText("Éviter les autoroutes"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Éviter les routes non pavées"),
    ).toBeInTheDocument();

    const generate = screen.getAllByRole("button", { name: "Générer ma ride" });
    expect(generate).toHaveLength(1);
    expect(generate[0]).toBeEnabled();
    expect(generate[0]).toHaveAttribute("type", "submit");
    expect(document.querySelector("select")).toBeNull();
    expect(screen.getByText("Ride").closest("header")?.className).toContain(
      "safe-area-inset-top",
    );
  });

  it("does not request GPS automatically on load (FR-017, FR-022)", () => {
    const getCurrentPosition = vi.fn();
    const geolocation = {
      getCurrentPosition,
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
    };
    vi.stubGlobal("navigator", {
      ...navigator,
      geolocation,
    });

    try {
      render(<Home />);

      expect(screen.getByRole("button", { name: "Ma position" })).toBeEnabled();
      expect(getCurrentPosition).not.toHaveBeenCalled();
      expect(geolocation.watchPosition).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
