import { selectPreferredVoiceIndex } from "@/domain/navigation/voice";

export type SpeechGuidance = {
  available: boolean;
  speak: (text: string) => void;
  cancel: () => void;
  setMuted: (muted: boolean) => void;
};

export type SpeechSynthesisLike = {
  speaking?: boolean;
  getVoices: () => SpeechSynthesisVoice[];
  speak: (utterance: SpeechSynthesisUtterance) => void;
  cancel: () => void;
};

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

  return {
    available: Boolean(speech),
    setMuted(next) {
      muted = next;
      if (muted) {
        speech?.cancel();
      }
    },
    cancel() {
      speech?.cancel();
    },
    speak(text) {
      if (!speech || muted || !text) {
        return;
      }
      speech.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "fr-CA";
      const voices = speech.getVoices();
      const index = selectPreferredVoiceIndex(voices);
      if (index >= 0 && voices[index]) {
        utterance.voice = voices[index];
        utterance.lang = voices[index]!.lang || "fr-CA";
      }
      speech.speak(utterance);
    },
  };
}
