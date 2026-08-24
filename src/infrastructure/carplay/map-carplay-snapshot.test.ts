import { describe, expect, it } from "vitest";
import type { LineString } from "@/domain/geo/types";
import type { NavigationProgress, NavigationStep } from "@/domain/navigation/types";
import { toCarPlaySessionSnapshot } from "./map-carplay-snapshot";

const geometry: LineString = {
  type: "LineString",
  coordinates: [
    [-72.7, 45.4],
    [-72.68, 45.4],
  ],
};

const step: NavigationStep = {
  id: "step:1:turn",
  maneuverType: "turn",
  modifier: "right",
  location: { latitude: 45.4, longitude: -72.68 },
  ref: "112",
  distanceKm: 2,
  durationMinutes: 3,
  geometry,
};

const progress: NavigationProgress = {
  projection: {
    snapped: { latitude: 45.4, longitude: -72.7 },
    distanceToRouteM: 2,
    progressKm: 0.1,
    remainingDistanceKm: 1.9,
    remainingDurationMinutes: 2.8,
    segmentIndex: 0,
  },
  currentStepIndex: 0,
  nextStep: step,
  distanceToNextManeuverM: 250,
  remainingDistanceKm: 1.9,
  remainingDurationMinutes: 2.8,
  lowAccuracy: false,
};

describe("toCarPlaySessionSnapshot (FR-028, BR-004)", () => {
  it("maps domain progress to a provider-agnostic CarPlay DTO", () => {
    const snapshot = toCarPlaySessionSnapshot({
      routeId: "loop-1",
      geometry,
      progress,
      userLocation: { latitude: 45.401, longitude: -72.699 },
      headingDeg: 92,
      muted: false,
      speakText: "Dans 250 mètres, tournez à droite",
      remainingDistanceKm: 2,
      remainingDurationMinutes: 3,
    });

    expect(snapshot.routeId).toBe("loop-1");
    expect(snapshot.cancelSpeech).toBe(false);

    expect(snapshot.coordinates).toEqual([
      { latitude: 45.4, longitude: -72.7 },
      { latitude: 45.4, longitude: -72.68 },
    ]);
    expect(snapshot.userLocation).toEqual({
      latitude: 45.401,
      longitude: -72.699,
    });
    expect(snapshot.headingDeg).toBe(92);
    expect(snapshot.remainingDistanceKm).toBe(1.9);
    expect(snapshot.remainingDurationMinutes).toBe(2.8);
    expect(snapshot.muted).toBe(false);
    expect(snapshot.lowAccuracy).toBe(false);
    expect(snapshot.speakText).toBe("Dans 250 mètres, tournez à droite");
    expect(snapshot.maneuver).toEqual({
      instruction: "Tournez à droite sur la route 112.",
      roadLabel: "la route 112",
      distanceToManeuverM: 250,
      maneuverType: "turn",
      modifier: "right",
    });
  });

  it("keeps geometry before the first GPS fix and drops invalid positions", () => {
    const snapshot = toCarPlaySessionSnapshot({
      routeId: "loop-2",
      geometry: {
        type: "LineString",
        coordinates: [
          [-72.7, 45.4],
          [Number.NaN, 45.4],
        ],
      },
      progress: null,
      userLocation: null,
      headingDeg: Number.NaN,
      muted: true,
      cancelSpeech: true,
      remainingDistanceKm: 8,
      remainingDurationMinutes: 14,
    });

    expect(snapshot.coordinates).toEqual([{ latitude: 45.4, longitude: -72.7 }]);
    expect(snapshot.userLocation).toBeNull();
    expect(snapshot.headingDeg).toBeNull();
    expect(snapshot.maneuver).toBeNull();
    expect(snapshot.remainingDistanceKm).toBe(8);
    expect(snapshot.muted).toBe(true);
    expect(snapshot.cancelSpeech).toBe(true);
    expect(snapshot.speakText).toBeNull();
  });
});
