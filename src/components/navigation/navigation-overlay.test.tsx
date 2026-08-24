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
    expect(screen.getByRole("button", { name: "Arrêter" })).toHaveClass(
      "min-h-12",
      "min-w-12",
    );
  });

  it("toggles mute, recenters and stops through the floating actions (FR-023, FR-025)", () => {
    const onMuteToggle = vi.fn();
    const onRecenter = vi.fn();
    const onStop = vi.fn();
    renderOverlay({ onMuteToggle, onRecenter, onStop });

    fireEvent.click(screen.getByRole("button", { name: "Muet" }));
    fireEvent.click(screen.getByRole("button", { name: "Recentrer" }));
    fireEvent.click(screen.getByRole("button", { name: "Arrêter" }));

    expect(onMuteToggle).toHaveBeenCalledTimes(1);
    expect(onRecenter).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
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
});
