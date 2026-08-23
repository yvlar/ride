import { describe, expect, it, vi } from "vitest";
import { createSpeechGuidance } from "./speech-guidance";

class FakeUtterance {
  text: string;
  lang = "";
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

describe("createSpeechGuidance (FR-025)", () => {
  it("selects a fr-CA voice and never overlaps utterances", () => {
    const voices = [
      { lang: "en-US", name: "Samantha" },
      { lang: "fr-CA", name: "Amelie" },
    ] as SpeechSynthesisVoice[];
    const speak = vi.fn();
    const cancel = vi.fn();
    const guidance = createSpeechGuidance({
      getVoices: () => voices,
      speak,
      cancel,
    });

    const original = globalThis.SpeechSynthesisUtterance;
    globalThis.SpeechSynthesisUtterance =
      FakeUtterance as unknown as typeof SpeechSynthesisUtterance;

    guidance.speak("Tournez à droite sur la route 112.");
    guidance.speak("Au rond-point, prenez la deuxième sortie.");

    expect(cancel).toHaveBeenCalledTimes(2);
    expect(speak).toHaveBeenCalledTimes(2);
    const last = speak.mock.calls[1]?.[0] as FakeUtterance;
    expect(last.voice?.name).toBe("Amelie");
    expect(last.lang).toBe("fr-CA");

    globalThis.SpeechSynthesisUtterance = original;
  });

  it("keeps visual navigation when speechSynthesis is missing", () => {
    const guidance = createSpeechGuidance(null);
    expect(guidance.available).toBe(false);
    expect(() => guidance.speak("Bonjour")).not.toThrow();
  });

  it("unlocks speechSynthesis without speaking a maneuver (FR-025)", () => {
    const speak = vi.fn();
    const resume = vi.fn();
    const guidance = createSpeechGuidance({
      getVoices: () => [],
      speak,
      cancel: vi.fn(),
      resume,
    });
    guidance.unlock();
    expect(resume).toHaveBeenCalledTimes(1);
    expect(speak).not.toHaveBeenCalled();
  });

  it("does not speak while muted", () => {
    const speak = vi.fn();
    const guidance = createSpeechGuidance({
      getVoices: () => [],
      speak,
      cancel: vi.fn(),
    });
    guidance.setMuted(true);
    guidance.speak("Tournez à droite.");
    expect(speak).not.toHaveBeenCalled();
  });
});
