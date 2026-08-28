import { LOW_ACCURACY_LIMIT_M } from "./constants";

/**
 * FR-041 — one explicit phase for the live navigation surface.
 *
 * The session already owns the FR-036 lifecycle machine
 * (`session-state.ts`). This adds the *display* phase: what a rider glancing
 * at the phone must be told, ranked by urgency, so the UI never shows a blank
 * map or a silently frozen screen.
 */
export type NavigationStatusPhase =
  | "starting"
  | "locating"
  | "suspended"
  | "offline"
  | "recalculating"
  | "off_route"
  | "gps_denied"
  | "gps_lost"
  | "weak_gps"
  | "error"
  | "arrived"
  | "navigating";

export type NavigationStatusTone = "neutral" | "info" | "warning" | "danger";

export type NavigationStatus = {
  phase: NavigationStatusPhase;
  /** Short sentence shown in the status banner. */
  message: string;
  tone: NavigationStatusTone;
  /** True while the rider should not trust the maneuver card yet. */
  transient: boolean;
};

export const NAVIGATION_STATUS_MESSAGES = {
  starting: "Démarrage de la navigation…",
  locating: "Recherche de votre position…",
  generating: "Génération du trajet…",
  suspended: "Navigation en pause — revenez dans Ride",
  offline: "Connexion indisponible — le trajet reste affiché",
  recalculating: "Recalcul en cours…",
  offRoute: "Vous avez quitté le trajet",
  gpsDenied: "Localisation refusée — autorisez le GPS dans les réglages",
  gpsLost: "Signal GPS perdu — le trajet reste affiché",
  weakGps: "Signal GPS faible",
  arrived: "Vous êtes arrivé",
  generationFailed: "Impossible de générer le trajet",
} as const;

export type NavigationStatusInput = {
  /** No GPS fix has been applied yet. */
  hasFix: boolean;
  /** The document is hidden and no vehicle display took over. */
  suspended: boolean;
  online: boolean;
  recalculating: boolean;
  offRoute: boolean;
  /** Non-null when the location watch reported a failure. */
  gpsErrorCode:
    | "PERMISSION_DENIED"
    | "UNAVAILABLE"
    | "TIMEOUT"
    | "POSITION_UNAVAILABLE"
    | null;
  accuracyMeters: number | null;
  /** A recalculation failed and the rider has to act. */
  errorMessage: string | null;
  arrived: boolean;
};

/**
 * Ranked so the most actionable problem wins. A rider gets one message, never
 * a stack of competing badges.
 */
export function deriveNavigationStatus(
  input: NavigationStatusInput,
): NavigationStatus {
  if (input.gpsErrorCode === "PERMISSION_DENIED") {
    return {
      phase: "gps_denied",
      message: NAVIGATION_STATUS_MESSAGES.gpsDenied,
      tone: "danger",
      transient: false,
    };
  }
  if (input.suspended) {
    return {
      phase: "suspended",
      message: NAVIGATION_STATUS_MESSAGES.suspended,
      tone: "warning",
      transient: true,
    };
  }
  if (input.errorMessage) {
    return {
      phase: "error",
      message: input.errorMessage,
      tone: "danger",
      transient: false,
    };
  }
  if (input.recalculating) {
    return {
      phase: "recalculating",
      message: NAVIGATION_STATUS_MESSAGES.recalculating,
      tone: "info",
      transient: true,
    };
  }
  if (!input.online) {
    return {
      phase: "offline",
      message: NAVIGATION_STATUS_MESSAGES.offline,
      tone: "warning",
      transient: true,
    };
  }
  if (input.offRoute) {
    return {
      phase: "off_route",
      message: NAVIGATION_STATUS_MESSAGES.offRoute,
      tone: "warning",
      transient: true,
    };
  }
  if (input.gpsErrorCode) {
    return {
      phase: "gps_lost",
      message: NAVIGATION_STATUS_MESSAGES.gpsLost,
      tone: "warning",
      transient: true,
    };
  }
  if (!input.hasFix) {
    return {
      phase: "locating",
      message: NAVIGATION_STATUS_MESSAGES.locating,
      tone: "info",
      transient: true,
    };
  }
  if (input.arrived) {
    return {
      phase: "arrived",
      message: NAVIGATION_STATUS_MESSAGES.arrived,
      tone: "neutral",
      transient: false,
    };
  }
  if (
    input.accuracyMeters !== null &&
    input.accuracyMeters > LOW_ACCURACY_LIMIT_M
  ) {
    return {
      phase: "weak_gps",
      message: NAVIGATION_STATUS_MESSAGES.weakGps,
      tone: "warning",
      transient: true,
    };
  }
  return {
    phase: "navigating",
    message: "",
    tone: "neutral",
    transient: false,
  };
}
