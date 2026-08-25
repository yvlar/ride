import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Home from "./page";
import { AppearanceProvider } from "@/components/theme/appearance-provider";

function renderHome() {
  return render(
    <AppearanceProvider>
      <Home />
    </AppearanceProvider>,
  );
}

describe("Home explorer (FR-014, FR-031)", () => {
  it("shows the map-first explorer instead of dumping every control", () => {
    renderHome();

    expect(
      screen.getByRole("heading", { name: "Où veux-tu rouler?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Rechercher une destination" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Créer une boucle moto" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Décrire mon trajet" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("navigation", { name: "Navigation principale" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/variantes/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Générer ma ride" }),
    ).not.toBeInTheDocument();
  });

  it("opens the composition flow from Créer une boucle (FR-014, NFR-001, NFR-002)", () => {
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Créer une boucle moto" }));

    expect(
      screen.getByRole("combobox", { name: "Point de départ" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ma position" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: /Boucle/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/Distance cible \(km\)/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Routes sinueuses" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Panoramique" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Équilibré" })).toBeInTheDocument();
    expect(screen.getByLabelText("Éviter les autoroutes")).toBeInTheDocument();
    expect(screen.getByLabelText("Canada seulement")).toBeInTheDocument();
    expect(screen.getByLabelText("Corridors RAG")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Générer ma ride" })).toBeEnabled();
    expect(document.querySelector("select")).toBeNull();
    expect(screen.getByRole("button", { name: /Rapide/ })).toBeDisabled();
    expect(screen.getByLabelText("Éviter les péages")).toBeDisabled();
  });

  it("exposes route preferences in Réglages, not in Décrire mon trajet (FR-031, FR-034)", () => {
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Décrire mon trajet" }));
    expect(screen.queryByLabelText("Éviter les autoroutes")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Éviter les routes non pavées"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Canada seulement")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Réglages" }));
    expect(screen.getByRole("heading", { name: "Réglages" })).toBeInTheDocument();
    expect(screen.getByLabelText("Éviter les autoroutes")).toBeChecked();
    expect(screen.getByLabelText("Éviter les routes non pavées")).toBeChecked();
    expect(screen.getByLabelText("Canada seulement")).not.toBeChecked();
  });

  it("keeps primary actions at 48px on a phone viewport (NFR-001)", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    renderHome();
    expect(
      screen.getByRole("button", { name: "Rechercher une destination" }),
    ).toHaveClass("min-h-12");
    expect(
      screen.getByRole("navigation", { name: "Navigation principale" }),
    ).toBeInTheDocument();
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
      renderHome();
      expect(getCurrentPosition).not.toHaveBeenCalled();
      expect(geolocation.watchPosition).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
