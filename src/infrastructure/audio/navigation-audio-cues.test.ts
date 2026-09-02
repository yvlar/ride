import { describe, expect, it, vi } from "vitest";
import { cueTones, NAVIGATION_CUE_TONES } from "@/domain/navigation/audio-cues";
import {
  createNavigationAudioCues,
  type AudioContextLike,
  type OscillatorLike,
} from "./navigation-audio-cues";

function fakeContext() {
  const oscillators: Array<
    OscillatorLike & {
      started: number[];
      stopped: number[];
      frequencies: Array<[number, number]>;
    }
  > = [];
  const resume = vi.fn();
  const context: AudioContextLike = {
    currentTime: 10,
    destination: {},
    resume,
    createOscillator() {
      const oscillator = {
        type: "",
        started: [] as number[],
        stopped: [] as number[],
        frequencies: [] as Array<[number, number]>,
        frequency: {
          setValueAtTime(value: number, when: number) {
            oscillator.frequencies.push([value, when]);
          },
          linearRampToValueAtTime() {},
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
        start(when = 0) {
          oscillator.started.push(when);
        },
        stop(when = 0) {
          oscillator.stopped.push(when);
        },
      };
      oscillators.push(oscillator);
      return oscillator;
    },
    createGain() {
      return {
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
    },
  };
  return { context, oscillators, resume };
}

describe("createNavigationAudioCues (FR-044)", () => {
  it("schedules one tone per cue step, at the domain frequencies", () => {
    const { context, oscillators } = fakeContext();
    const cues = createNavigationAudioCues(() => context);

    cues.play("imminent");

    const tones = NAVIGATION_CUE_TONES.imminent;
    expect(oscillators).toHaveLength(tones.length);
    oscillators.forEach((oscillator, index) => {
      const tone = tones[index]!;
      expect(oscillator.frequencies[0]?.[0]).toBe(tone.frequencyHz);
      expect(oscillator.started[0]).toBeCloseTo(
        10 + tone.startOffsetMs / 1_000,
        5,
      );
    });
  });

  it("resumes the context so an iOS gesture unlocks playback", () => {
    const { context, resume } = fakeContext();
    const cues = createNavigationAudioCues(() => context);
    cues.unlock();
    expect(resume).toHaveBeenCalled();
  });

  it("plays nothing while muted and cuts what is scheduled", () => {
    const { context, oscillators } = fakeContext();
    const cues = createNavigationAudioCues(() => context);

    cues.play("approach");
    const scheduled = oscillators.length;
    cues.setMuted(true);
    cues.play("imminent");

    expect(oscillators).toHaveLength(scheduled);
    expect(oscillators.every((oscillator) => oscillator.stopped.length > 0)).toBe(
      true,
    );
  });

  it("never lets two cues overlap", () => {
    const { context, oscillators } = fakeContext();
    const cues = createNavigationAudioCues(() => context);

    cues.play("prepare");
    const first = oscillators[0]!;
    cues.play("imminent");

    expect(first.stopped.length).toBeGreaterThan(1);
  });

  it("stays silent, without throwing, when Web Audio is missing", () => {
    const cues = createNavigationAudioCues(null);
    expect(cues.available).toBe(false);
    expect(() => cues.play("arrival")).not.toThrow();
    expect(() => cues.unlock()).not.toThrow();
  });

  it("survives a context that refuses to build", () => {
    const cues = createNavigationAudioCues(() => {
      throw new Error("no audio");
    });
    expect(() => cues.play("reroute")).not.toThrow();
  });
});

describe("cue voices (FR-046)", () => {
  it("plays a plain sine until a voice asks for something else", () => {
    const { context, oscillators } = fakeContext();
    const cues = createNavigationAudioCues(() => context);

    cues.play("imminent");

    expect(oscillators).toHaveLength(NAVIGATION_CUE_TONES.imminent.length);
    for (const oscillator of oscillators) {
      expect(oscillator.type).toBe("sine");
    }
  });

  it("takes the arcade timbre and its pitches from the domain", () => {
    const { context, oscillators } = fakeContext();
    const cues = createNavigationAudioCues(() => context);

    cues.setVoice("arcade");
    cues.play("imminent");

    const arcade = cueTones("imminent", "arcade");
    expect(oscillators).toHaveLength(arcade.length);
    expect(oscillators.map((oscillator) => oscillator.type)).toEqual(
      arcade.map((tone) => tone.waveform),
    );
    expect(oscillators.map((oscillator) => oscillator.frequencies[0][0])).toEqual(
      arcade.map((tone) => tone.frequencyHz),
    );
  });

  it("switches voice on the running engine, without a second context", () => {
    // The regression this guards: a rebuilt AudioContext is born suspended on
    // iOS, far from the gesture that unlocked the first, and the rider would
    // lose every cue for the rest of the ride.
    const { context } = fakeContext();
    const factory = vi.fn(() => context);
    const cues = createNavigationAudioCues(factory);

    cues.play("prepare");
    cues.setVoice("arcade");
    cues.play("prepare");
    cues.setVoice("standard");
    cues.play("prepare");

    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("stays silent while muted, whatever the voice", () => {
    const { context, oscillators } = fakeContext();
    const cues = createNavigationAudioCues(() => context);

    cues.setVoice("arcade");
    cues.setMuted(true);
    cues.play("go");

    expect(oscillators).toHaveLength(0);
  });
});
