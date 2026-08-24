import { describe, expect, it } from "vitest";
import {
  isActiveNavigationState,
  transitionNavigationState,
  type NavigationSessionState,
} from "./session-state";

function run(
  start: NavigationSessionState,
  events: Parameters<typeof transitionNavigationState>[1][],
): NavigationSessionState {
  return events.reduce(
    (state, event) => transitionNavigationState(state, event),
    start,
  );
}

describe("navigation session state machine (FR-036)", () => {
  it("covers start, stop and restore of a foreground session (FR-023)", () => {
    expect(
      run("idle", [
        "generate_started",
        "generate_succeeded",
        "ready",
        "start",
      ]),
    ).toBe("navigating");
    expect(transitionNavigationState("navigating", "stop")).toBe("idle");
    expect(isActiveNavigationState("navigating")).toBe(true);
    expect(isActiveNavigationState("idle")).toBe(false);
  });

  it("recalculates without leaving the navigation mode (FR-026)", () => {
    expect(
      run("navigating", [
        "off_route",
        "recalculate_started",
        "recalculate_succeeded",
      ]),
    ).toBe("navigating");
    expect(
      run("navigating", [
        "off_route",
        "recalculate_started",
        "recalculate_failed",
      ]),
    ).toBe("off_route");
  });

  it("survives a temporary GPS loss without crashing the session", () => {
    expect(run("navigating", ["gps_lost", "gps_recovered"])).toBe("navigating");
    expect(transitionNavigationState("gps_lost", "error")).toBe("error");
  });

  it("requires permission before locating (FR-017, FR-023)", () => {
    expect(run("idle", ["permission_denied"])).toBe("permission_required");
    expect(run("permission_required", ["permission_granted"])).toBe("locating");
  });

  it("suspends when the app backgrounds without CarPlay, then resumes", () => {
    expect(run("navigating", ["suspend", "resume"])).toBe("navigating");
  });
});
