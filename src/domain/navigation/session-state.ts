export type NavigationSessionState =
  | "idle"
  | "permission_required"
  | "locating"
  | "calculating"
  | "preview"
  | "ready"
  | "navigating"
  | "off_route"
  | "recalculating"
  | "gps_lost"
  | "suspended"
  | "arrived"
  | "error";

export type NavigationSessionEvent =
  | "compose"
  | "permission_denied"
  | "permission_granted"
  | "location_acquired"
  | "generate_started"
  | "generate_succeeded"
  | "generate_failed"
  | "ready"
  | "start"
  | "off_route"
  | "recalculate_started"
  | "recalculate_succeeded"
  | "recalculate_failed"
  | "gps_lost"
  | "gps_recovered"
  | "suspend"
  | "resume"
  | "arrive"
  | "stop"
  | "error";

const NAVIGATING_STATES: ReadonlySet<NavigationSessionState> = new Set([
  "navigating",
  "off_route",
  "recalculating",
  "gps_lost",
  "suspended",
]);

export function isActiveNavigationState(state: NavigationSessionState): boolean {
  return NAVIGATING_STATES.has(state);
}

export function transitionNavigationState(
  state: NavigationSessionState,
  event: NavigationSessionEvent,
): NavigationSessionState {
  if (event === "stop") {
    return "idle";
  }

  switch (state) {
    case "idle":
      if (event === "compose" || event === "permission_granted") return "locating";
      if (event === "permission_denied") return "permission_required";
      if (event === "generate_started") return "calculating";
      if (event === "error") return "error";
      return state;
    case "permission_required":
      if (event === "permission_granted") return "locating";
      if (event === "compose") return "locating";
      if (event === "error") return "error";
      return state;
    case "locating":
      if (event === "location_acquired") return "idle";
      if (event === "permission_denied") return "permission_required";
      if (event === "generate_started") return "calculating";
      if (event === "error") return "error";
      return state;
    case "calculating":
      if (event === "generate_succeeded") return "preview";
      if (event === "generate_failed" || event === "error") return "error";
      return state;
    case "preview":
      if (event === "ready") return "ready";
      if (event === "start") return "navigating";
      if (event === "generate_started") return "calculating";
      if (event === "error") return "error";
      return state;
    case "ready":
      if (event === "start") return "navigating";
      if (event === "generate_started") return "calculating";
      if (event === "permission_denied") return "permission_required";
      if (event === "error") return "error";
      return state;
    case "navigating":
      if (event === "off_route") return "off_route";
      if (event === "recalculate_started") return "recalculating";
      if (event === "gps_lost") return "gps_lost";
      if (event === "suspend") return "suspended";
      if (event === "arrive") return "arrived";
      if (event === "error") return "error";
      return state;
    case "off_route":
      if (event === "recalculate_started") return "recalculating";
      if (event === "gps_lost") return "gps_lost";
      if (event === "start") return "navigating";
      if (event === "error") return "error";
      return state;
    case "recalculating":
      if (event === "recalculate_succeeded") return "navigating";
      if (event === "recalculate_failed") return "off_route";
      if (event === "gps_lost") return "gps_lost";
      if (event === "error") return "error";
      return state;
    case "gps_lost":
      if (event === "gps_recovered") return "navigating";
      if (event === "suspend") return "suspended";
      if (event === "error") return "error";
      return state;
    case "suspended":
      if (event === "resume") return "navigating";
      if (event === "error") return "error";
      return state;
    case "arrived":
      if (event === "start") return "navigating";
      return state;
    case "error":
      if (event === "compose" || event === "generate_started") return "calculating";
      if (event === "ready") return "ready";
      return state;
    default:
      return state;
  }
}
