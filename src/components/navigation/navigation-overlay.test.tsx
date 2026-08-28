import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  FOLLOW_SUSPENDED_MESSAGE,
  RECENTER_LABEL,
  STOP_NAVIGATION_LABEL,
} from "@/domain/navigation/session-copy";
import {
  deriveNavigationStatus,
  NAVIGATION_STATUS_MESSAGES,
} from "@/domain/navigation/status";
import { NavigationOverlay } from "./navigation-overlay";
import { formatEta } from "./format-navigation";

const nowMs = Date.UTC(2026, 7, 24, 16, 0, 0);

const NAVIGATING_STATUS = deriveNavigationStatus({
  hasFix: true,
  suspended: false,
  online: true,
  recalculating: false,
  offRoute: false,
  gpsErrorCode: null,
  accuracyMeters: 8,
  errorMessage: null,
  arrived: false,
});

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
    status: NAVIGATING_STATUS,
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

describe("NavigationOverlay (FR-023, FR-024, FR-042, NFR-006)", () => {
  it("shows the maneuver card and the progress panel over the map (FR-024)", () => {
    renderOverlay();

    expect(
      screen.getByRole("banner", { name: "Prochaine manœuvre" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("contentinfo", { name: "Progression du trajet" }),
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
  });

  it("shows the destination so the rider keeps their target in view (FR-042)", () => {
    renderOverlay({ destinationLabel: "Magog" });
    expect(screen.getByText("Vers Magog")).toBeInTheDocument();
  });

  it("shows the following maneuver discreetly when one exists (FR-042)", () => {
    renderOverlay({
      followingArrow: "←",
      followingInstruction: "Tournez à gauche sur la 243",
    });
    expect(
      screen.getByLabelText("Manœuvre suivante"),
    ).toHaveTextContent("Puis ← Tournez à gauche sur la 243");
  });

  it("omits the following maneuver line when the route has no next step (FR-042)", () => {
    renderOverlay();
    expect(screen.queryByLabelText("Manœuvre suivante")).not.toBeInTheDocument();
  });

  it("uses 48px floating controls (NFR-006)", () => {
    renderOverlay();
    expect(
      screen.getAllByRole("button", { name: "Couper le guidage vocal" })[0],
    ).toHaveClass("min-h-12", "min-w-12");
    expect(screen.getByRole("button", { name: RECENTER_LABEL })).toHaveClass(
      "min-h-12",
      "min-w-12",
    );
    expect(
      screen.getByRole("button", { name: STOP_NAVIGATION_LABEL }),
    ).toHaveClass("min-h-12");
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

    fireEvent.click(
      screen.getAllByRole("button", { name: "Couper le guidage vocal" })[0]!,
    );
    fireEvent.click(screen.getByRole("button", { name: RECENTER_LABEL }));
    fireEvent.click(screen.getByRole("button", { name: "Aperçu du trajet" }));
    fireEvent.click(
      screen.getByRole("button", { name: STOP_NAVIGATION_LABEL }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Oui, terminer" }));

    expect(onMuteToggle).toHaveBeenCalledTimes(1);
    expect(onRecenter).toHaveBeenCalledTimes(1);
    expect(onOverview).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("asks for confirmation before ending, and lets the rider back out (FR-042)", () => {
    const onStop = vi.fn();
    renderOverlay({ onStop });

    fireEvent.click(
      screen.getByRole("button", { name: STOP_NAVIGATION_LABEL }),
    );
    expect(
      screen.getByRole("alertdialog", { name: STOP_NAVIGATION_LABEL }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(onStop).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("does not show 0 m as the maneuver distance before a GPS fix (FR-024)", () => {
    renderOverlay({
      instruction: "Recherche de la position…",
      distanceToManeuverKm: 0,
      accuracyMeters: null,
      status: deriveNavigationStatus({
        hasFix: false,
        suspended: false,
        online: true,
        recalculating: false,
        offRoute: false,
        gpsErrorCode: null,
        accuracyMeters: null,
        errorMessage: null,
        arrived: false,
      }),
    });

    const banner = screen.getByRole("banner", { name: "Prochaine manœuvre" });
    expect(banner).toHaveTextContent("—");
    expect(banner).not.toHaveTextContent("0 m");
    expect(screen.getByTestId("navigation-status")).toHaveTextContent(
      NAVIGATION_STATUS_MESSAGES.locating,
    );
  });

  it("names every transient state instead of leaving the map silent (FR-042)", () => {
    const cases = [
      [{ recalculating: true }, NAVIGATION_STATUS_MESSAGES.recalculating],
      [{ offRoute: true }, NAVIGATION_STATUS_MESSAGES.offRoute],
      [{ online: false }, NAVIGATION_STATUS_MESSAGES.offline],
      [{ accuracyMeters: 400 }, NAVIGATION_STATUS_MESSAGES.weakGps],
      [
        { gpsErrorCode: "PERMISSION_DENIED" as const },
        NAVIGATION_STATUS_MESSAGES.gpsDenied,
      ],
      [
        { gpsErrorCode: "POSITION_UNAVAILABLE" as const },
        NAVIGATION_STATUS_MESSAGES.gpsLost,
      ],
    ] as const;

    for (const [overrides, message] of cases) {
      const { unmount } = renderOverlay({
        status: deriveNavigationStatus({
          hasFix: true,
          suspended: false,
          online: true,
          recalculating: false,
          offRoute: false,
          gpsErrorCode: null,
          accuracyMeters: 8,
          errorMessage: null,
          arrived: false,
          ...overrides,
        }),
      });
      expect(screen.getByTestId("navigation-status")).toHaveTextContent(message);
      unmount();
    }
  });

  it("promotes the recentre control once the rider pans the map (FR-042)", () => {
    const onRecenter = vi.fn();
    renderOverlay({ followingUser: false, onRecenter });

    expect(screen.getByText(FOLLOW_SUSPENDED_MESSAGE)).toBeInTheDocument();
    const prominent = screen.getByTestId("recenter-prominent");
    expect(prominent).toHaveClass("min-h-14");

    fireEvent.click(prominent);
    expect(onRecenter).toHaveBeenCalledTimes(1);
  });

  it("hides the prominent recentre bar while the camera is following (FR-042)", () => {
    renderOverlay({ followingUser: true });
    expect(screen.queryByTestId("recenter-prominent")).not.toBeInTheDocument();
    expect(screen.queryByText(FOLLOW_SUSPENDED_MESSAGE)).not.toBeInTheDocument();
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
    fireEvent.click(
      screen.getByRole("button", { name: "Réessayer le recalcul" }),
    );
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
