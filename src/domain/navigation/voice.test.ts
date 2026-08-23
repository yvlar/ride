import { describe, expect, it } from "vitest";
import { ANNOUNCEMENT_THRESHOLDS_M } from "./constants";
import {
  announcementPhaseForDistance,
  decideAnnouncement,
  emptyVoiceMemory,
  selectPreferredVoiceIndex,
} from "./voice";
import type { NavigationStep } from "./types";

const step: NavigationStep = {
  id: "step:1:turn",
  maneuverType: "turn",
  modifier: "right",
  location: { latitude: 45.4, longitude: -72.7 },
  ref: "112",
  distanceKm: 0.4,
  durationMinutes: 0.5,
  geometry: {
    type: "LineString",
    coordinates: [
      [-72.7, 45.4],
      [-72.69, 45.4],
    ],
  },
};

describe("selectPreferredVoiceIndex (FR-025)", () => {
  it("prefers fr-CA then fr-FR then any French voice", () => {
    expect(
      selectPreferredVoiceIndex([
        { lang: "en-US", name: "Samantha" },
        { lang: "fr-FR", name: "Thomas" },
        { lang: "fr-CA", name: "Amelie" },
      ]),
    ).toBe(2);
    expect(
      selectPreferredVoiceIndex([
        { lang: "en-US", name: "Samantha" },
        { lang: "fr-FR", name: "Thomas" },
      ]),
    ).toBe(1);
    expect(
      selectPreferredVoiceIndex([
        { lang: "en-US", name: "Samantha" },
        { lang: "fr-BE", name: "Marie" },
      ]),
    ).toBe(1);
    expect(selectPreferredVoiceIndex([{ lang: "en-US", name: "Samantha" }])).toBe(
      0,
    );
    expect(selectPreferredVoiceIndex([])).toBe(-1);
  });
});

describe("announcement thresholds (FR-025)", () => {
  it("uses the centralized configurable distances", () => {
    expect(ANNOUNCEMENT_THRESHOLDS_M.prepare).toBe(500);
    expect(announcementPhaseForDistance(400)).toBe("prepare");
    expect(announcementPhaseForDistance(120)).toBe("approach");
    expect(announcementPhaseForDistance(20)).toBe("imminent");
    expect(announcementPhaseForDistance(800)).toBeNull();
  });
});

describe("decideAnnouncement (FR-025)", () => {
  it("does not speak when muted", () => {
    const decision = decideAnnouncement({
      step,
      distanceToManeuverM: 30,
      muted: true,
      memory: emptyVoiceMemory(),
    });
    expect(decision.speak).toBeNull();
  });

  it("speaks a phase only once per maneuver despite GPS flicker", () => {
    const first = decideAnnouncement({
      step,
      distanceToManeuverM: 30,
      muted: false,
      memory: emptyVoiceMemory(),
    });
    expect(first.speak).toMatch(/Tournez à droite/);
    const second = decideAnnouncement({
      step,
      distanceToManeuverM: 38,
      muted: false,
      memory: first.memory,
    });
    expect(second.speak).toBeNull();
    const third = decideAnnouncement({
      step,
      distanceToManeuverM: 25,
      muted: false,
      memory: second.memory,
    });
    expect(third.speak).toBeNull();
  });
});
