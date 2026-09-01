import { describe, expect, it, vi } from "vitest";
import { createSpeechGuidance, type SpeechSynthesisLike } from "./speech-guidance";

class FakeUtterance {
  text: string;
  lang = "";
  volume = 1;
  voice: SpeechSynthesisVoice | null = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

function withFakeUtterance<T>(run: () => T): T {
  const original = globalThis.SpeechSynthesisUtterance;
  globalThis.SpeechSynthesisUtterance =
    FakeUtterance as unknown as typeof SpeechSynthesisUtterance;
  try {
    return run();
  } finally {
    globalThis.SpeechSynthesisUtterance = original;
  }
}

/** A synthesis engine that tracks `speaking`, the way a browser does. */
function fakeSynthesis(voices: SpeechSynthesisVoice[] = []) {
  const spoken: FakeUtterance[] = [];
  const speak = vi.fn((utterance: SpeechSynthesisUtterance) => {
    synthesis.speaking = true;
    spoken.push(utterance as unknown as FakeUtterance);
  });
  const cancel = vi.fn(() => {
    synthesis.speaking = false;
  });
  const resume = vi.fn();
  const listeners = new Map<string, () => void>();
  const synthesis: SpeechSynthesisLike & { speaking: boolean } = {
    speaking: false,
    getVoices: () => voices,
    speak,
    cancel,
    resume,
    addEventListener: (type, listener) => {
      listeners.set(type, listener);
    },
  };
  return { synthesis, speak, cancel, resume, spoken, listeners };
}

describe("createSpeechGuidance (FR-025)", () => {
  it("selects a fr-CA voice and never overlaps utterances", () => {
    const voices = [
      { lang: "en-US", name: "Samantha" },
      { lang: "fr-CA", name: "Amelie" },
    ] as SpeechSynthesisVoice[];
    const { synthesis, speak, cancel, spoken } = fakeSynthesis(voices);
    const guidance = createSpeechGuidance(synthesis);

    withFakeUtterance(() => {
      guidance.speak("Tournez à droite sur la route 112.");
      guidance.speak("Au rond-point, prenez la deuxième sortie.");
    });

    expect(speak).toHaveBeenCalledTimes(2);
    // The idle engine is left alone; only the live utterance is cleared.
    expect(cancel).toHaveBeenCalledTimes(1);
    const last = spoken[1]!;
    expect(last.voice?.name).toBe("Amelie");
    expect(last.lang).toBe("fr-CA");
  });

  it("speaks a silent priming utterance during the unlock gesture (FR-025)", () => {
    const { synthesis, speak, resume, spoken } = fakeSynthesis();
    const guidance = createSpeechGuidance(synthesis);

    withFakeUtterance(() => {
      guidance.unlock();
    });

    // iOS only grants speech to a page that spoke inside a user gesture.
    expect(resume).toHaveBeenCalled();
    expect(speak).toHaveBeenCalledTimes(1);
    expect(spoken[0]?.volume).toBe(0);
    expect(spoken[0]?.text.trim()).toBe("");
    expect(guidance.status?.().unlocked).toBe(true);
  });

  it("primes only once, and keeps resuming a paused queue afterwards", () => {
    const { synthesis, speak, resume } = fakeSynthesis();
    const guidance = createSpeechGuidance(synthesis);

    withFakeUtterance(() => {
      guidance.unlock();
      guidance.unlock();
    });

    expect(speak).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledTimes(2);
  });

  it("resumes the queue before every announcement", () => {
    const { synthesis, resume } = fakeSynthesis();
    const guidance = createSpeechGuidance(synthesis);

    withFakeUtterance(() => {
      guidance.speak("Tournez à gauche.");
    });

    expect(resume).toHaveBeenCalledTimes(1);
  });

  it("uses the French voice published after voiceschanged", () => {
    let voices: SpeechSynthesisVoice[] = [];
    const spoken: FakeUtterance[] = [];
    const listeners = new Map<string, () => void>();
    const synthesis: SpeechSynthesisLike = {
      speaking: false,
      getVoices: () => voices,
      speak: (utterance) => spoken.push(utterance as unknown as FakeUtterance),
      cancel: vi.fn(),
      resume: vi.fn(),
      addEventListener: (type, listener) => listeners.set(type, listener),
    };
    const guidance = createSpeechGuidance(synthesis);

    withFakeUtterance(() => {
      guidance.unlock();
      voices = [
        { lang: "en-US", name: "Samantha" },
        { lang: "fr-CA", name: "Amelie" },
      ] as SpeechSynthesisVoice[];
      listeners.get("voiceschanged")?.();
      guidance.speak("Tournez à droite.");
    });

    expect(spoken[1]?.voice?.name).toBe("Amelie");
  });

  it("reports a failure so the session can fall back to audio cues", () => {
    const { synthesis, spoken } = fakeSynthesis();
    const guidance = createSpeechGuidance(synthesis);

    withFakeUtterance(() => {
      guidance.speak("Tournez à droite.");
      spoken[0]?.onerror?.();
    });

    expect(guidance.status?.().failed).toBe(true);
  });

  it("keeps visual navigation when speechSynthesis is missing", () => {
    const guidance = createSpeechGuidance(null);
    expect(guidance.available).toBe(false);
    expect(guidance.status?.().available).toBe(false);
    expect(() => guidance.speak("Bonjour")).not.toThrow();
    expect(() => guidance.unlock()).not.toThrow();
  });

  it("does not speak while muted", () => {
    const { synthesis, speak } = fakeSynthesis();
    const guidance = createSpeechGuidance(synthesis);
    guidance.setMuted(true);
    withFakeUtterance(() => {
      guidance.speak("Tournez à droite.");
    });
    expect(speak).not.toHaveBeenCalled();
  });
});
