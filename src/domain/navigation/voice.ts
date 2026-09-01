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
  /**
   * FR-025 — identifiant publié par le moteur. Optionnel : plusieurs navigateurs
   * ne l'exposent pas, et la sélection sait retomber sur le nom.
   */
  voiceURI?: string;
};

export type AnnouncementDecision = {
  speak: string | null;
  phase: AnnouncementPhase | null;
  memory: VoiceAnnouncementMemory;
};

/**
 * FR-025 — 0 = `fr-CA`, 1 = `fr-FR`, 2 = autre voix française, 3 = non française.
 * Partagé par le classement automatique et par le regroupement du sélecteur des
 * Réglages, pour que les deux ne puissent pas diverger.
 */
export function frenchVoiceRank(lang: string): 0 | 1 | 2 | 3 {
  const normalized = lang.trim().toLowerCase().replace(/_/g, "-");
  if (normalized === "fr-ca" || normalized.startsWith("fr-ca")) {
    return 0;
  }
  if (normalized === "fr-fr" || normalized.startsWith("fr-fr")) {
    return 1;
  }
  if (normalized === "fr" || normalized.startsWith("fr-")) {
    return 2;
  }
  return 3;
}

export function selectPreferredVoiceIndex(
  voices: readonly SpeechVoiceCandidate[],
): number {
  if (voices.length === 0) {
    return -1;
  }
  let bestIndex = -1;
  let bestRank: 0 | 1 | 2 | 3 = 3;
  for (let index = 0; index < voices.length; index += 1) {
    const rank = frenchVoiceRank(voices[index].lang);
    if (rank < bestRank) {
      bestRank = rank;
      bestIndex = index;
      if (rank === 0) {
        break;
      }
    }
  }
  // Aucune voix française : le texte français est lu par la voix disponible.
  return bestIndex >= 0 ? bestIndex : 0;
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
