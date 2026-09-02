import {
  cueTones,
  type CueVoice,
  type NavigationCue,
} from "@/domain/navigation/audio-cues";

export type AudioParamLike = {
  value?: number;
  setValueAtTime: (value: number, when: number) => void;
  linearRampToValueAtTime: (value: number, when: number) => void;
};

export type OscillatorLike = {
  type: string;
  frequency: AudioParamLike;
  connect: (destination: unknown) => void;
  start: (when?: number) => void;
  stop: (when?: number) => void;
  disconnect?: () => void;
};

export type GainLike = {
  gain: AudioParamLike;
  connect: (destination: unknown) => void;
  disconnect?: () => void;
};

export type AudioContextLike = {
  state?: string;
  currentTime: number;
  destination: unknown;
  createOscillator: () => OscillatorLike;
  createGain: () => GainLike;
  resume?: () => Promise<void> | void;
};

export type AudioContextFactory = () => AudioContextLike | null;

export type NavigationAudioCues = {
  available: boolean;
  /** Play one cue; overlapping cues are cut so two never pile up. */
  play: (cue: NavigationCue) => void;
  setMuted: (muted: boolean) => void;
  /**
   * FR-046 — the timbre follows the map theme. Changing it never rebuilds the
   * `AudioContext`: a fresh one is born suspended on iOS, far from the gesture
   * that unlocked the first, and the rider would lose every cue for the rest of
   * the ride. So the voice is a setting on the running engine, not a
   * constructor argument.
   */
  setVoice: (voice: CueVoice) => void;
  /** Resume the context during the gesture that starts navigation (FR-044). */
  unlock: () => void;
  stop: () => void;
};

/** Fade in and out so a tone never clicks in a helmet speaker. */
const RAMP_S = 0.012;

function browserAudioContextFactory(): AudioContextLike | null {
  if (typeof window === "undefined") {
    return null;
  }
  const constructor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!constructor) {
    return null;
  }
  try {
    return new constructor() as unknown as AudioContextLike;
  } catch {
    return null;
  }
}

/**
 * FR-044 — synthesized earcons, no audio file and no network. Web Audio has
 * none of the `speechSynthesis` limits that keep iOS silent, so these cues
 * still reach the rider when the voice does not (FR-025).
 */
export function createNavigationAudioCues(
  factory?: AudioContextFactory | null,
): NavigationAudioCues {
  const resolve: AudioContextFactory | null =
    factory === undefined ? browserAudioContextFactory : factory;
  let context: AudioContextLike | null = null;
  let resolved = false;
  let muted = false;
  let voice: CueVoice = "standard";
  let playing: OscillatorLike[] = [];

  function audioContext(): AudioContextLike | null {
    if (!resolve) {
      return null;
    }
    if (!resolved) {
      resolved = true;
      try {
        context = resolve();
      } catch {
        context = null;
      }
    }
    return context;
  }

  function stopScheduled() {
    for (const oscillator of playing) {
      try {
        oscillator.stop();
        oscillator.disconnect?.();
      } catch {
        // An oscillator already finished is not an error.
      }
    }
    playing = [];
  }

  return {
    available: Boolean(resolve),
    setVoice(next) {
      voice = next;
    },
    setMuted(next) {
      muted = next;
      if (muted) {
        stopScheduled();
      }
    },
    stop() {
      stopScheduled();
    },
    unlock() {
      const ctx = audioContext();
      if (!ctx) {
        return;
      }
      try {
        void ctx.resume?.();
      } catch {
        // Navigation continues without cues if the context stays suspended.
      }
    },
    play(cue) {
      if (muted) {
        return;
      }
      const ctx = audioContext();
      if (!ctx) {
        return;
      }
      try {
        void ctx.resume?.();
      } catch {
        // Fall through: a suspended context simply plays nothing.
      }
      stopScheduled();
      const startedAt = ctx.currentTime;
      for (const tone of cueTones(cue, voice)) {
        try {
          const oscillator = ctx.createOscillator();
          const gain = ctx.createGain();
          const start = startedAt + tone.startOffsetMs / 1_000;
          const end = start + tone.durationMs / 1_000;
          oscillator.type = tone.waveform ?? "sine";
          oscillator.frequency.setValueAtTime(tone.frequencyHz, start);
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(tone.gain, start + RAMP_S);
          gain.gain.linearRampToValueAtTime(tone.gain, Math.max(start + RAMP_S, end - RAMP_S));
          gain.gain.linearRampToValueAtTime(0, end);
          oscillator.connect(gain);
          gain.connect(ctx.destination);
          oscillator.start(start);
          oscillator.stop(end + RAMP_S);
          playing.push(oscillator);
        } catch {
          // NFR-006 — a broken audio node must not take down navigation.
        }
      }
    },
  };
}
