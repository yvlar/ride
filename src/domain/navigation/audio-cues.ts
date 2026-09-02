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
  | "arrival"
  /*
   * FR-046 — the two sounds of the start countdown: a pip on 3, 2 and 1, then
   * the launch chord on GO. `decideNavigationCue` never returns them — the
   * countdown plays them directly — but they share the engine, so muting the
   * session silences them like everything else.
   */
  | "countdown"
  | "go";

/**
 * FR-044 — the shape of an oscillator. A square wave is fatiguing in a helmet
 * speaker, so it belongs to the tone rather than to the voice: that way a voice
 * can be bright on the cues that must cut through and stay gentle on the ones
 * that merely warn, instead of choosing once for all five.
 */
export type CueWaveform = "sine" | "triangle" | "square";

/**
 * FR-044, FR-046 — a set of timbres a display can pick. This is a *sound*, not
 * a map theme: the domain must not learn the name of a basemap (`BR-004`), so
 * mapping a theme to a voice is the interface's job.
 */
export type CueVoice = "standard" | "arcade";

export type CueTone = {
  /** Pitch in hertz. */
  frequencyHz: number;
  /** How long the pitch is held. */
  durationMs: number;
  /** Peak gain, kept under the voice so the instruction stays intelligible. */
  gain: number;
  /** Delay from the start of the cue. */
  startOffsetMs: number;
  /** Defaults to a sine, which is what every cue sounded like originally. */
  waveform?: CueWaveform;
};

/** Under the voice: a cue leads an instruction, it never masks it. */
const CUE_GAIN = 0.12;
const SOFT_CUE_GAIN = 0.09;

const STANDARD_CUE_TONES: Record<NavigationCue, readonly CueTone[]> = {
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
  // The standard look has no countdown, so these are never heard today. They
  // are defined anyway: the table is total, and a future display that wants a
  // countdown inherits something sober rather than nothing.
  countdown: [
    { frequencyHz: 880, durationMs: 110, gain: SOFT_CUE_GAIN, startOffsetMs: 0 },
  ],
  go: [
    { frequencyHz: 1320, durationMs: 200, gain: CUE_GAIN, startOffsetMs: 0 },
  ],
};

/**
 * FR-046 — the arcade timbre. Same cues, same moments, same gains: only the
 * shape of the wave and the intervals change, so nothing about when a rider is
 * warned is altered by a choice of basemap.
 *
 * The intervals are the common stock of racing-cabinet sound — rising fourths
 * and fifths, a pip on a plain square wave. Nothing here transcribes a melody
 * from any published game.
 */
const ARCADE_CUE_TONES: Record<NavigationCue, readonly CueTone[]> = {
  // Soft triangle: a square this early would nag.
  prepare: [
    {
      frequencyHz: 784,
      durationMs: 130,
      gain: SOFT_CUE_GAIN,
      startOffsetMs: 0,
      waveform: "triangle",
    },
  ],
  // Rising fourth, still on a triangle.
  approach: [
    {
      frequencyHz: 784,
      durationMs: 110,
      gain: CUE_GAIN,
      startOffsetMs: 0,
      waveform: "triangle",
    },
    {
      frequencyHz: 1047,
      durationMs: 130,
      gain: CUE_GAIN,
      startOffsetMs: 140,
      waveform: "triangle",
    },
  ],
  // Now the square: the turn is here, and this one has to cut through.
  imminent: [
    {
      frequencyHz: 1047,
      durationMs: 80,
      gain: CUE_GAIN,
      startOffsetMs: 0,
      waveform: "square",
    },
    {
      frequencyHz: 1047,
      durationMs: 80,
      gain: CUE_GAIN,
      startOffsetMs: 110,
      waveform: "square",
    },
    {
      frequencyHz: 1568,
      durationMs: 120,
      gain: CUE_GAIN,
      startOffsetMs: 220,
      waveform: "square",
    },
  ],
  // Descending square: something went wrong.
  reroute: [
    {
      frequencyHz: 622,
      durationMs: 120,
      gain: CUE_GAIN,
      startOffsetMs: 0,
      waveform: "square",
    },
    {
      frequencyHz: 415,
      durationMs: 180,
      gain: CUE_GAIN,
      startOffsetMs: 140,
      waveform: "square",
    },
  ],
  // Rising arpeggio: the finish line.
  arrival: [
    {
      frequencyHz: 784,
      durationMs: 90,
      gain: CUE_GAIN,
      startOffsetMs: 0,
      waveform: "square",
    },
    {
      frequencyHz: 1047,
      durationMs: 90,
      gain: CUE_GAIN,
      startOffsetMs: 100,
      waveform: "square",
    },
    {
      frequencyHz: 1319,
      durationMs: 90,
      gain: CUE_GAIN,
      startOffsetMs: 200,
      waveform: "square",
    },
    {
      frequencyHz: 1568,
      durationMs: 180,
      gain: CUE_GAIN,
      startOffsetMs: 300,
      waveform: "square",
    },
  ],
  // The starting lights: one flat pip per number.
  countdown: [
    {
      frequencyHz: 784,
      durationMs: 140,
      gain: CUE_GAIN,
      startOffsetMs: 0,
      waveform: "square",
    },
  ],
  // Lights out: an octave above the pips, held, so GO is unmistakably the end.
  go: [
    {
      frequencyHz: 1568,
      durationMs: 150,
      gain: CUE_GAIN,
      startOffsetMs: 0,
      waveform: "square",
    },
    {
      frequencyHz: 2093,
      durationMs: 280,
      gain: CUE_GAIN,
      startOffsetMs: 160,
      waveform: "square",
    },
  ],
};

export const NAVIGATION_CUE_VOICES: Record<
  CueVoice,
  Record<NavigationCue, readonly CueTone[]>
> = {
  standard: STANDARD_CUE_TONES,
  arcade: ARCADE_CUE_TONES,
};

/** The voice Ride has always had, for callers that never chose one. */
export const NAVIGATION_CUE_TONES = STANDARD_CUE_TONES;

export function cueTones(
  cue: NavigationCue,
  voice: CueVoice = "standard",
): readonly CueTone[] {
  return NAVIGATION_CUE_VOICES[voice][cue];
}

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

export function cueDurationMs(
  cue: NavigationCue,
  voice: CueVoice = "standard",
): number {
  return cueTones(cue, voice).reduce(
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
