import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FOREGROUND_ONLY_MESSAGE } from "@/domain/navigation/session-copy";
import { NavigationOverlay } from "./navigation-overlay";
import { formatEta } from "./format-navigation";

const nowMs = Date.UTC(2026, 7, 24, 16, 0, 0);

function renderOverlay(
  overrides: Partial<ComponentProps<typeof NavigationOverlay>> = {},
) {
  const props: ComponentProps<typeof NavigationOverlay> = {
    arrow: "→",
    instruction: "Tournez à droite",
    nextRoad: "112",
    distanceToManeuverKm: 0.25,
    remainingDistanceKm: 8.4,
    remainingMinutes: 12,
    nowMs,
    accuracyMeters: 8,
    gpsError: null,
    recalculating: false,
    hidden: false,
    muted: false,
    recalcError: null,
    onMuteToggle: () => {},
    onRecenter: () => {},
    onStop: () => {},
    onRetryRecalculate: () => {},
    ...overrides,
  };
  return render(<NavigationOverlay {...props} />);
}

describe("NavigationOverlay (FR-023, FR-024, NFR-006)", () => {
  it("shows the Google Maps-style overlay chrome without sandwiching the map (FR-024)", () => {
    renderOverlay();

    expect(
      screen.getByRole("banner", { name: "Prochaine manœuvre" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("contentinfo", { name: "Arrivée estimée" }),
    ).toBeInTheDocument();
    expect(screen.getByText("250 m")).toBeInTheDocument();
    expect(
      screen.getByRole("banner", { name: "Prochaine manœuvre" }),
    ).toHaveTextContent("→");
    expect(screen.getByText("112")).toBeInTheDocument();
    expect(screen.getByText("Tournez à droite")).toBeInTheDocument();
    expect(screen.getByText(formatEta(nowMs, 12))).toBeInTheDocument();
    expect(screen.getByText("12 min")).toBeInTheDocument();
    expect(screen.getByText("8.4 km")).toBeInTheDocument();
    expect(screen.getByText("±8 m")).toBeInTheDocument();
    expect(screen.getByText(FOREGROUND_ONLY_MESSAGE)).toBeInTheDocument();
  });

  it("uses 48px floating controls (NFR-006)", () => {
    renderOverlay();
    expect(screen.getByRole("button", { name: "Muet" })).toHaveClass(
      "min-h-12",
      "min-w-12",
    );
    expect(screen.getByRole("button", { name: "Recentrer" })).toHaveClass(
      "min-h-12",
      "min-w-12",
    );
    expect(screen.getByRole("button", { name: "Annuler la navigation" })).toHaveClass(
      "min-h-12",
    );
    expect(screen.getByRole("button", { name: "Aperçu du trajet" })).toHaveClass(
      "min-h-12",
      "min-w-12",
    );
  });

  it("toggles mute, recenters and stops through the floating actions (FR-023, FR-025)", () => {
    const onMuteToggle = vi.fn();
    const onRecenter = vi.fn();
    const onOverview = vi.fn();
    const onStop = vi.fn();
    renderOverlay({ onMuteToggle, onRecenter, onOverview, onStop });

    fireEvent.click(screen.getByRole("button", { name: "Muet" }));
    fireEvent.click(screen.getByRole("button", { name: "Recentrer" }));
    fireEvent.click(screen.getByRole("button", { name: "Aperçu du trajet" }));
    fireEvent.click(screen.getByRole("button", { name: "Annuler la navigation" }));
    fireEvent.click(screen.getByRole("button", { name: "Oui, annuler" }));

    expect(onMuteToggle).toHaveBeenCalledTimes(1);
    expect(onRecenter).toHaveBeenCalledTimes(1);
    expect(onOverview).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("does not show 0 m as the maneuver distance before a GPS fix (FR-024)", () => {
    renderOverlay({
      instruction: "Recherche de la position…",
      distanceToManeuverKm: 0,
      accuracyMeters: null,
      gpsError: null,
    });

    const banner = screen.getByRole("banner", { name: "Prochaine manœuvre" });
    expect(banner).toHaveTextContent("—");
    expect(banner).not.toHaveTextContent("0 m");
    expect(screen.getByText("GPS en attente")).toBeInTheDocument();
    expect(screen.getByText("Recherche de la position…")).toBeInTheDocument();
  });

  it("keeps a retry action when recalculation fails (FR-026)", () => {
    const onRetryRecalculate = vi.fn();
    renderOverlay({
      recalcError: {
        code: "NO_ROUTE_FOUND",
        message: "Aucun corridor disponible.",
        suggestions: [],
      },
      onRetryRecalculate,
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Aucun corridor disponible.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(onRetryRecalculate).toHaveBeenCalledTimes(1);
  });

  it("shows CarPlay as the active display when the phone is backgrounded (FR-028)", () => {
    renderOverlay({ hidden: true, carPlayConnected: true });
    expect(screen.getByText("Navigation active sur CarPlay.")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "La navigation nécessite que l’application reste ouverte au premier plan.",
      ),
    ).not.toBeInTheDocument();
  });

  it("shows the GPX phase label (FR-039)", () => {
    renderOverlay({ statusLabel: "Rejoindre le trajet GPX" });
    expect(screen.getByText("Rejoindre le trajet GPX")).toBeInTheDocument();
  });
});
