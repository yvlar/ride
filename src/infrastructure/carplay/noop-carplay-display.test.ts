import { describe, expect, it } from "vitest";
import { createNoopCarPlayDisplay } from "./noop-carplay-display";
import type { CarPlaySessionSnapshot } from "./types";

const snapshot: CarPlaySessionSnapshot = {
  routeId: "loop-1",
  coordinates: [{ latitude: 45.4, longitude: -72.7 }],
  userLocation: null,
  headingDeg: null,
  remainingDistanceKm: 1,
  remainingDurationMinutes: 2,
  muted: false,
  lowAccuracy: false,
  cancelSpeech: false,
  maneuver: null,
  speakText: null,
};

describe("createNoopCarPlayDisplay (FR-028)", () => {
  it("never claims a CarPlay connection on the web", async () => {
    const display = createNoopCarPlayDisplay();
    await expect(display.start(snapshot)).resolves.toEqual({
      connected: false,
      ownsVoice: false,
    });
    await expect(display.update(snapshot)).resolves.toBeUndefined();
    await expect(display.stop()).resolves.toBeUndefined();
    const unsubscribe = display.subscribe(() => {
      throw new Error("web CarPlay must not emit");
    });
    unsubscribe();
  });
});
