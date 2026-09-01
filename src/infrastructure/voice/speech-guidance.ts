import { selectPreferredVoiceIndex } from "@/domain/navigation/voice";

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

export type SpeechGuidance = {
  available: boolean;
  speak: (text: string) => void;
  cancel: () => void;
  setMuted: (muted: boolean) => void;
  /** Unlock Web Speech during the user gesture that starts navigation (FR-025). */
  unlock: () => void;
  /**
   * Diagnostic read used to decide the FR-044 fallback. Optional so a stub or
   * a future adapter can stay minimal; an adapter without it is trusted.
   */
  status?: () => SpeechGuidanceStatus;
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

export function createSpeechGuidance(
  synthesis?: SpeechSynthesisLike | null,
): SpeechGuidance {
  const speech =
    synthesis === undefined
      ? typeof window !== "undefined"
        ? window.speechSynthesis
        : null
      : synthesis;
  let muted = false;
  let unlocked = false;
  let hasSpoken = false;
  let failed = false;
  let voices: SpeechSynthesisVoice[] = [];
  let voicesBound = false;

  function refreshVoices() {
    try {
      voices = speech?.getVoices() ?? [];
    } catch {
      voices = [];
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

  function applyVoice(utterance: SpeechSynthesisUtterance) {
    utterance.lang = "fr-CA";
    if (voices.length === 0) {
      refreshVoices();
    }
    const index = selectPreferredVoiceIndex(voices);
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
    speak(text) {
      if (!speech || muted || !text) {
        return;
      }
      resumeQueue();
      const utterance = newUtterance(text);
      if (!utterance) {
        failed = true;
        return;
      }
      applyVoice(utterance);
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
