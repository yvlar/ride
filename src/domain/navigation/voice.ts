import { ANNOUNCEMENT_THRESHOLDS_M } from "./constants";
import { formatFrenchInstruction } from "./instructions";
import type {
  AnnouncementPhase,
  NavigationStep,
  VoiceAnnouncementMemory,
} from "./types";

export type SpeechVoiceCandidate = {
  lang: string;
  name: string;
};

export type AnnouncementDecision = {
  speak: string | null;
  phase: AnnouncementPhase | null;
  memory: VoiceAnnouncementMemory;
};

export function selectPreferredVoiceIndex(
  voices: readonly SpeechVoiceCandidate[],
): number {
  if (voices.length === 0) {
    return -1;
  }
  const ranked = [
    (lang: string) => lang === "fr-ca" || lang.startsWith("fr-ca"),
    (lang: string) => lang === "fr-fr" || lang.startsWith("fr-fr"),
    (lang: string) => lang === "fr" || lang.startsWith("fr-") || lang.startsWith("fr_"),
  ];
  for (const match of ranked) {
    const index = voices.findIndex((voice) => match(voice.lang.trim().toLowerCase()));
    if (index >= 0) {
      return index;
    }
  }
  return 0;
}

export function announcementPhaseForDistance(
  distanceM: number,
  thresholds = ANNOUNCEMENT_THRESHOLDS_M,
): AnnouncementPhase | null {
  if (!Number.isFinite(distanceM) || distanceM < 0) {
    return null;
  }
  if (distanceM <= thresholds.imminent) {
    return "imminent";
  }
  if (distanceM <= thresholds.approach) {
    return "approach";
  }
  if (distanceM <= thresholds.prepare) {
    return "prepare";
  }
  return null;
}

export function emptyVoiceMemory(): VoiceAnnouncementMemory {
  return { byStepId: {} };
}

export function decideAnnouncement(input: {
  step: NavigationStep | null;
  distanceToManeuverM: number;
  muted: boolean;
  memory: VoiceAnnouncementMemory;
  thresholds?: typeof ANNOUNCEMENT_THRESHOLDS_M;
}): AnnouncementDecision {
  const memory: VoiceAnnouncementMemory = {
    byStepId: { ...input.memory.byStepId },
  };
  if (input.muted || !input.step) {
    return { speak: null, phase: null, memory };
  }

  const phase = announcementPhaseForDistance(
    input.distanceToManeuverM,
    input.thresholds,
  );
  if (!phase) {
    return { speak: null, phase: null, memory };
  }

  const spoken = memory.byStepId[input.step.id] ?? [];
  if (spoken.includes(phase)) {
    return { speak: null, phase, memory };
  }

  memory.byStepId[input.step.id] = [...spoken, phase];
  return {
    speak: formatFrenchInstruction(input.step),
    phase,
    memory,
  };
}

export function resetVoiceMemory(): VoiceAnnouncementMemory {
  return emptyVoiceMemory();
}
