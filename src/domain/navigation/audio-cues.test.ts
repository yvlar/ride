import { describe, expect, it } from "vitest";
import {
  cueDurationMs,
  cueForAnnouncementPhase,
  cueTones,
  decideNavigationCue,
  emptyCueMemory,
  NAVIGATION_CUE_TONES,
  NAVIGATION_CUE_VOICES,
  type CueVoice,
  type NavigationCue,
} from "./audio-cues";

const VOICES = Object.keys(NAVIGATION_CUE_VOICES) as CueVoice[];

describe("navigation cue voices (FR-044, FR-046)", () => {
  it("gives every voice every cue", () => {
    // A display picks a voice, not a cue list: a hole in one of them would go
    // silent at exactly the moment the rider needed telling.
    const cues = Object.keys(NAVIGATION_CUE_TONES).sort();
    for (const voice of VOICES) {
      expect(Object.keys(NAVIGATION_CUE_VOICES[voice]).sort()).toEqual(cues);
    }
  });

  it("holds every voice to the same limits as the original", () => {
    for (const voice of VOICES) {
      for (const tones of Object.values(NAVIGATION_CUE_VOICES[voice])) {
        expect(tones.length).toBeGreaterThan(0);
        for (const tone of tones) {
          // A theme may change how a cue sounds, never how loud it is.
          expect(tone.gain).toBeGreaterThan(0);
          expect(tone.gain).toBeLessThanOrEqual(0.2);
          expect(tone.durationMs).toBeGreaterThan(0);
          expect(tone.frequencyHz).toBeGreaterThan(0);
          if (tone.waveform !== undefined) {
            expect(["sine", "triangle", "square"]).toContain(tone.waveform);
          }
        }
        const offsets = tones.map((tone) => tone.startOffsetMs);
        expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
        expect(offsets[0]).toBe(0);
      }
    }
  });

  it("keeps every cue of every voice short enough to precede a maneuver", () => {
    for (const voice of VOICES) {
      for (const cue of Object.keys(NAVIGATION_CUE_VOICES[voice]) as NavigationCue[]) {
        expect(cueDurationMs(cue, voice)).toBeLessThanOrEqual(600);
      }
    }
  });

  it("leaves the standard voice on a plain sine, as it always was", () => {
    for (const tones of Object.values(NAVIGATION_CUE_VOICES.standard)) {
      for (const tone of tones) {
        expect(tone.waveform).toBeUndefined();
      }
    }
    expect(cueTones("imminent")).toBe(NAVIGATION_CUE_TONES.imminent);
  });

  it("spares the helmet the square wave until the turn is here", () => {
    // A square wave nags; the early warnings stay on a triangle and only the
    // cues that must cut through get the harsher timbre.
    const shapeOf = (cue: NavigationCue) =>
      cueTones(cue, "arcade").map((tone) => tone.waveform);
    expect(shapeOf("prepare")).toEqual(["triangle"]);
    expect(shapeOf("approach")).toEqual(["triangle", "triangle"]);
    expect(shapeOf("imminent")).toEqual(["square", "square", "square"]);
  });
});

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
