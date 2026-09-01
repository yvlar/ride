import {
  DEFAULT_VOICE_PREFERENCES,
  readStoredVoicePreferences,
  selectVoiceIndex,
  type VoicePreferences,
} from "@/domain/navigation/voice-preferences";
import type { SpeechVoiceCandidate } from "@/domain/navigation/voice";

export type SpeechGuidanceStatus = {
  /** The browser exposes a speech engine at all. */
  available: boolean;
  /** A priming utterance was accepted during a user gesture. */
  unlocked: boolean;
  /** The engine actually started an utterance at least once. */
  hasSpoken: boolean;
  /** The engine reported an error; the session falls back to audio cues. */
  failed: boolean;
};

export type SpeakOptions = {
  /**
   * FR-025 — the Réglages preview must speak the selection being edited, before
   * it is written to storage (and it must work in private mode, where reading
   * storage back can throw).
   */
  preferences?: VoicePreferences;
};

export type SpeechGuidance = {
  available: boolean;
  speak: (text: string, options?: SpeakOptions) => void;
  cancel: () => void;
  setMuted: (muted: boolean) => void;
  /** Unlock Web Speech during the user gesture that starts navigation (FR-025). */
  unlock: () => void;
  /**
   * Diagnostic read used to decide the FR-044 fallback. Optional so a stub or
   * a future adapter can stay minimal; an adapter without it is trusted.
   */
  status?: () => SpeechGuidanceStatus;
  /**
   * FR-025 — the voices Réglages offers. Optional like `status`, so the existing
   * test stubs stay minimal; a settings panel without it shows only "Automatique".
   */
  listVoices?: () => readonly SpeechVoiceCandidate[];
  /** Notifies when the engine publishes a different voice list (`voiceschanged`). */
  subscribeVoices?: (listener: () => void) => () => void;
};

export type SpeechGuidanceOptions = {
  /**
   * FR-025 — read per utterance, so a change made in Réglages reaches the engine
   * that already exists. The engine is built in three memoized places with no
   * common owner, so a setter would leave at least one of them stale.
   */
  readPreferences?: () => VoicePreferences;
};

export type SpeechSynthesisLike = {
  speaking?: boolean;
  pending?: boolean;
  paused?: boolean;
  getVoices: () => SpeechSynthesisVoice[];
  speak: (utterance: SpeechSynthesisUtterance) => void;
  cancel: () => void;
  resume?: () => void;
  addEventListener?: (type: string, listener: () => void) => void;
};

/**
 * FR-025 — iOS only grants speech to a page that spoke *during* a user
 * gesture. A maneuver is announced from a geolocation callback, which is not a
 * gesture, so the first real utterance would be dropped for the whole ride.
 * Speaking this silent placeholder when navigation starts is what makes every
 * later announcement audible.
 */
const PRIMING_TEXT = " ";

const NO_VOICES: readonly SpeechVoiceCandidate[] = Object.freeze([]);

/** Safari in private mode can throw on the `window.localStorage` access itself. */
function defaultReadPreferences(): VoicePreferences {
  try {
    if (typeof window === "undefined") {
      return { ...DEFAULT_VOICE_PREFERENCES };
    }
    return readStoredVoicePreferences(window.localStorage);
  } catch {
    return { ...DEFAULT_VOICE_PREFERENCES };
  }
}

function voiceSignature(voices: readonly SpeechSynthesisVoice[]): string {
  return voices
    .map((voice) => `${voice.voiceURI}|${voice.name}|${voice.lang}`)
    .join("\n");
}

export function createSpeechGuidance(
  synthesis?: SpeechSynthesisLike | null,
  options?: SpeechGuidanceOptions,
): SpeechGuidance {
  const speech =
    synthesis === undefined
      ? typeof window !== "undefined"
        ? window.speechSynthesis
        : null
      : synthesis;
  const readPreferences = options?.readPreferences ?? defaultReadPreferences;
  let muted = false;
  let unlocked = false;
  let hasSpoken = false;
  let failed = false;
  let voices: SpeechSynthesisVoice[] = [];
  let voicesBound = false;
  let signature = "";
  let voiceOptions: readonly SpeechVoiceCandidate[] = NO_VOICES;
  const listeners = new Set<() => void>();

  function refreshVoices() {
    let next: SpeechSynthesisVoice[];
    try {
      next = speech?.getVoices() ?? [];
    } catch {
      next = [];
    }
    voices = next;
    const nextSignature = voiceSignature(next);
    if (nextSignature === signature) {
      // Chrome fires `voiceschanged` in bursts; only a real change is published,
      // otherwise the settings panel would re-render in a loop.
      return;
    }
    signature = nextSignature;
    voiceOptions = Object.freeze(
      next.map((voice) => ({
        lang: voice.lang,
        name: voice.name,
        voiceURI: voice.voiceURI,
      })),
    );
    for (const listener of listeners) {
      listener();
    }
  }

  /**
   * `getVoices()` is empty on the first calls in several browsers. Without
   * this, the first instruction is read by whatever default engine is loaded,
   * often in English (FR-025).
   */
  function bindVoicesChanged() {
    if (voicesBound || !speech?.addEventListener) {
      return;
    }
    voicesBound = true;
    try {
      speech.addEventListener("voiceschanged", refreshVoices);
    } catch {
      // An engine without events keeps the per-utterance lookup below.
    }
  }

  /** An iOS queue left paused by a screen lock never drains on its own. */
  function resumeQueue() {
    try {
      speech?.resume?.();
    } catch {
      // A resume failure must not stop the visual navigation.
    }
  }

  function newUtterance(text: string): SpeechSynthesisUtterance | null {
    if (typeof SpeechSynthesisUtterance === "undefined") {
      return null;
    }
    try {
      return new SpeechSynthesisUtterance(text);
    } catch {
      return null;
    }
  }

  function applyVoice(
    utterance: SpeechSynthesisUtterance,
    preferences: VoicePreferences,
  ) {
    utterance.lang = "fr-CA";
    utterance.rate = preferences.rate;
    utterance.pitch = preferences.pitch;
    if (voices.length === 0) {
      refreshVoices();
    }
    // FR-025 — the voice picked in Réglages, else the automatic ranking. The
    // fallback lives inside `selectVoiceIndex`, so a voice removed by an OS
    // update never leaves the ride silent.
    const index = selectVoiceIndex(voices, preferences.voice);
    const voice = index >= 0 ? voices[index] : undefined;
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang || "fr-CA";
    }
  }

  return {
    available: Boolean(speech),
    status() {
      return {
        available: Boolean(speech),
        unlocked,
        hasSpoken,
        failed,
      };
    },
    listVoices() {
      return voiceOptions;
    },
    subscribeVoices(listener) {
      listeners.add(listener);
      // Réglages is visited without any navigation having started, so this is
      // where the `voiceschanged` binding happens for that path.
      bindVoicesChanged();
      refreshVoices();
      return () => {
        listeners.delete(listener);
      };
    },
    setMuted(next) {
      muted = next;
      if (muted) {
        speech?.cancel();
      }
    },
    cancel() {
      speech?.cancel();
    },
    unlock() {
      if (!speech) {
        return;
      }
      // Also runs when the app returns to the foreground: resuming a paused
      // queue matters as much as the first grant.
      resumeQueue();
      refreshVoices();
      bindVoicesChanged();
      if (unlocked) {
        return;
      }
      const priming = newUtterance(PRIMING_TEXT);
      if (!priming) {
        return;
      }
      priming.volume = 0;
      priming.lang = "fr-CA";
      try {
        speech.speak(priming);
        unlocked = true;
      } catch {
        failed = true;
      }
    },
    speak(text, speakOptions) {
      if (!speech || muted || !text) {
        return;
      }
      resumeQueue();
      const utterance = newUtterance(text);
      if (!utterance) {
        failed = true;
        return;
      }
      applyVoice(utterance, speakOptions?.preferences ?? readPreferences());
      utterance.onstart = () => {
        hasSpoken = true;
      };
      utterance.onerror = () => {
        failed = true;
      };
      // FR-025 — two announcements never overlap. Cancelling an idle engine
      // is what drops the next utterance on Safari, so only clear a live one.
      if (speech.speaking || speech.pending) {
        speech.cancel();
      }
      try {
        speech.speak(utterance);
      } catch {
        failed = true;
      }
    },
  };
}
