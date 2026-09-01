import { describe, expect, it } from "vitest";
import {
  cueDurationMs,
  cueForAnnouncementPhase,
  decideNavigationCue,
  emptyCueMemory,
  NAVIGATION_CUE_TONES,
} from "./audio-cues";

describe("navigation cue tones (FR-044)", () => {
  it("stays under the voice and never starts a tone before the previous one", () => {
    for (const tones of Object.values(NAVIGATION_CUE_TONES)) {
      expect(tones.length).toBeGreaterThan(0);
      for (const tone of tones) {
        expect(tone.gain).toBeGreaterThan(0);
        expect(tone.gain).toBeLessThanOrEqual(0.2);
        expect(tone.durationMs).toBeGreaterThan(0);
        expect(tone.frequencyHz).toBeGreaterThan(0);
      }
      const offsets = tones.map((tone) => tone.startOffsetMs);
      expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
      expect(offsets[0]).toBe(0);
    }
  });

  it("keeps every cue short enough to precede a maneuver", () => {
    for (const cue of Object.keys(NAVIGATION_CUE_TONES) as Array<
      keyof typeof NAVIGATION_CUE_TONES
    >) {
      expect(cueDurationMs(cue)).toBeLessThanOrEqual(600);
    }
  });

  it("maps each announcement phase to its own cue", () => {
    expect(cueForAnnouncementPhase("prepare")).toBe("prepare");
    expect(cueForAnnouncementPhase("approach")).toBe("approach");
    expect(cueForAnnouncementPhase("imminent")).toBe("imminent");
  });
});

describe("decideNavigationCue (FR-044)", () => {
  it("plays nothing while muted", () => {
    const decision = decideNavigationCue({
      event: { type: "announcement", phase: "imminent" },
      muted: true,
      memory: emptyCueMemory(),
    });
    expect(decision.cue).toBeNull();
  });

  it("plays the cue of the announced phase", () => {
    const decision = decideNavigationCue({
      event: { type: "announcement", phase: "approach" },
      muted: false,
      memory: emptyCueMemory(),
    });
    expect(decision.cue).toBe("approach");
  });

  it("repeats the reroute cue on each recalculation", () => {
    const first = decideNavigationCue({
      event: { type: "reroute" },
      muted: false,
      memory: emptyCueMemory(),
    });
    const second = decideNavigationCue({
      event: { type: "reroute" },
      muted: false,
      memory: first.memory,
    });
    expect(first.cue).toBe("reroute");
    expect(second.cue).toBe("reroute");
  });

  it("plays the arrival cue once, whatever the GPS flicker", () => {
    const first = decideNavigationCue({
      event: { type: "arrival" },
      muted: false,
      memory: emptyCueMemory(),
    });
    const second = decideNavigationCue({
      event: { type: "arrival" },
      muted: false,
      memory: first.memory,
    });
    expect(first.cue).toBe("arrival");
    expect(second.cue).toBeNull();
  });

  it("never mutates the memory it was given", () => {
    const memory = emptyCueMemory();
    decideNavigationCue({ event: { type: "arrival" }, muted: false, memory });
    expect(memory.played).toEqual([]);
  });
});
