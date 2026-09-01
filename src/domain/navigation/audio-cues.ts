import type { AnnouncementPhase } from "./types";

/**
 * FR-044 — non-speech audio cues.
 *
 * The spoken instruction (FR-025) tells the rider *what* to do; a short earcon
 * tells them *that something is coming* before the sentence is understood, and
 * keeps working when `speechSynthesis` is unavailable or the helmet intercom
 * clips the first word. Tones are described here, in the domain, so both the
 * browser adapter and any future vehicle display play the same thing
 * (`BR-004`).
 */
export type NavigationCue =
  | "prepare"
  | "approach"
  | "imminent"
  | "reroute"
  | "arrival";

export type CueTone = {
  /** Sine pitch in hertz. */
  frequencyHz: number;
  /** How long the pitch is held. */
  durationMs: number;
  /** Peak gain, kept under the voice so the instruction stays intelligible. */
  gain: number;
  /** Delay from the start of the cue. */
  startOffsetMs: number;
};

/** Under the voice: a cue leads an instruction, it never masks it. */
const CUE_GAIN = 0.12;
const SOFT_CUE_GAIN = 0.09;

export const NAVIGATION_CUE_TONES: Record<NavigationCue, readonly CueTone[]> = {
  // A single soft tone: the maneuver is still 500 m away.
  prepare: [
    { frequencyHz: 880, durationMs: 130, gain: SOFT_CUE_GAIN, startOffsetMs: 0 },
  ],
  // Two rising tones: the maneuver is close.
  approach: [
    { frequencyHz: 880, durationMs: 110, gain: CUE_GAIN, startOffsetMs: 0 },
    { frequencyHz: 1175, durationMs: 130, gain: CUE_GAIN, startOffsetMs: 140 },
  ],
  // Three quick pips: turn now.
  imminent: [
    { frequencyHz: 1175, durationMs: 90, gain: CUE_GAIN, startOffsetMs: 0 },
    { frequencyHz: 1175, durationMs: 90, gain: CUE_GAIN, startOffsetMs: 120 },
    { frequencyHz: 1568, durationMs: 120, gain: CUE_GAIN, startOffsetMs: 240 },
  ],
  // Falling pair: something went wrong, the route is being rebuilt (FR-026).
  reroute: [
    { frequencyHz: 660, durationMs: 130, gain: CUE_GAIN, startOffsetMs: 0 },
    { frequencyHz: 440, durationMs: 180, gain: CUE_GAIN, startOffsetMs: 150 },
  ],
  // Rising triad: the ride is over.
  arrival: [
    { frequencyHz: 660, durationMs: 120, gain: CUE_GAIN, startOffsetMs: 0 },
    { frequencyHz: 880, durationMs: 120, gain: CUE_GAIN, startOffsetMs: 130 },
    { frequencyHz: 1320, durationMs: 220, gain: CUE_GAIN, startOffsetMs: 260 },
  ],
};

export type NavigationCueEvent =
  | { type: "announcement"; phase: AnnouncementPhase }
  | { type: "reroute" }
  | { type: "arrival" };

/** Cues that must not repeat while the same session state holds. */
export type NavigationCueMemory = {
  played: NavigationCue[];
};

export type NavigationCueDecision = {
  cue: NavigationCue | null;
  memory: NavigationCueMemory;
};

export function emptyCueMemory(): NavigationCueMemory {
  return { played: [] };
}

export function resetCueMemory(): NavigationCueMemory {
  return emptyCueMemory();
}

export function cueForAnnouncementPhase(phase: AnnouncementPhase): NavigationCue {
  return phase;
}

export function cueDurationMs(cue: NavigationCue): number {
  return NAVIGATION_CUE_TONES[cue].reduce(
    (longest, tone) => Math.max(longest, tone.startOffsetMs + tone.durationMs),
    0,
  );
}

/**
 * FR-044 — a cue is played when the matching announcement is (the voice memory
 * already limits an announcement to once per maneuver), when a recalculation
 * starts, and once on arrival. Muting the session silences every cue.
 */
export function decideNavigationCue(input: {
  event: NavigationCueEvent;
  muted: boolean;
  memory: NavigationCueMemory;
}): NavigationCueDecision {
  const memory: NavigationCueMemory = { played: [...input.memory.played] };
  if (input.muted) {
    return { cue: null, memory };
  }

  if (input.event.type === "announcement") {
    return { cue: cueForAnnouncementPhase(input.event.phase), memory };
  }

  if (input.event.type === "reroute") {
    return { cue: "reroute", memory };
  }

  if (memory.played.includes("arrival")) {
    return { cue: null, memory };
  }
  memory.played = [...memory.played, "arrival"];
  return { cue: "arrival", memory };
}
