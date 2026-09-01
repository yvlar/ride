import { frenchVoiceRank, selectPreferredVoiceIndex } from "./voice";
import type { SpeechVoiceCandidate } from "./voice";

/**
 * FR-025 — le choix de voix survit à la fermeture de l'application, contrairement
 * aux préférences de route qui expirent avec la session du navigateur.
 */
export const VOICE_PREFERENCES_STORAGE_KEY = "ride.settings.voice.v1";

/** `null` = classement automatique FR-025. */
export type VoiceSelection = {
  voiceURI: string;
  name: string;
  lang: string;
} | null;

export type VoicePreferences = {
  voice: VoiceSelection;
  rate: number;
  pitch: number;
};

export const DEFAULT_VOICE_PREFERENCES: VoicePreferences = {
  voice: null,
  rate: 1,
  pitch: 1,
};

/** Bornes de `SpeechSynthesisUtterance`; une valeur hors bornes est ramenée, pas rejetée. */
export const VOICE_RATE_RANGE = { min: 0.5, max: 2 } as const;
export const VOICE_PITCH_RANGE = { min: 0, max: 2 } as const;

export const VOICE_RATE_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 0.85, label: "Lent" },
  { value: 1, label: "Normal" },
  { value: 1.2, label: "Rapide" },
];

export const VOICE_PITCH_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 0.8, label: "Grave" },
  { value: 1, label: "Normale" },
  { value: 1.2, label: "Aiguë" },
];

function clamp(value: number, range: { min: number; max: number }): number {
  return Math.min(range.max, Math.max(range.min, value));
}

function normalizeNumber(
  value: unknown,
  range: { min: number; max: number },
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1;
  }
  return clamp(value, range);
}

function normalizeSelection(value: unknown): VoiceSelection {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (name === "") {
    // Sans nom, aucun des paliers d'appariement ne peut retrouver la voix.
    return null;
  }
  return {
    voiceURI: typeof record.voiceURI === "string" ? record.voiceURI.trim() : "",
    name,
    lang: typeof record.lang === "string" ? record.lang.trim() : "",
  };
}

export function normalizeVoicePreferences(value: unknown): VoicePreferences {
  if (typeof value !== "object" || value === null) {
    return { ...DEFAULT_VOICE_PREFERENCES };
  }
  const record = value as Record<string, unknown>;
  return {
    voice: normalizeSelection(record.voice),
    rate: normalizeNumber(record.rate, VOICE_RATE_RANGE),
    pitch: normalizeNumber(record.pitch, VOICE_PITCH_RANGE),
  };
}

export function readStoredVoicePreferences(
  storage: Pick<Storage, "getItem"> | null | undefined,
): VoicePreferences {
  if (!storage) {
    return { ...DEFAULT_VOICE_PREFERENCES };
  }
  let raw: string | null = null;
  try {
    raw = storage.getItem(VOICE_PREFERENCES_STORAGE_KEY);
  } catch {
    return { ...DEFAULT_VOICE_PREFERENCES };
  }
  if (raw == null || raw.trim() === "") {
    return { ...DEFAULT_VOICE_PREFERENCES };
  }
  try {
    return normalizeVoicePreferences(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_VOICE_PREFERENCES };
  }
}

export function writeStoredVoicePreferences(
  storage: Pick<Storage, "setItem"> | null | undefined,
  value: VoicePreferences,
): void {
  if (!storage) {
    return;
  }
  storage.setItem(
    VOICE_PREFERENCES_STORAGE_KEY,
    JSON.stringify(normalizeVoicePreferences(value)),
  );
}

function sameText(left: string, right: string): boolean {
  return left.trim() !== "" && left.trim() === right.trim();
}

function sameLang(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * FR-025 — la voix choisie dans Réglages, sinon le classement automatique.
 *
 * Apple a réécrit `voiceURI` entre versions d'iOS et les autres moteurs utilisent
 * leurs propres schémas : on apparie donc en quatre paliers pour qu'une mise à
 * jour du système ne rende jamais la navigation muette.
 */
export function selectVoiceIndex(
  voices: readonly SpeechVoiceCandidate[],
  selection: VoiceSelection,
): number {
  if (voices.length === 0) {
    return -1;
  }
  if (selection) {
    const byUri = voices.findIndex((voice) =>
      sameText(voice.voiceURI ?? "", selection.voiceURI),
    );
    if (byUri >= 0) {
      return byUri;
    }
    const byNameAndLang = voices.findIndex(
      (voice) =>
        sameText(voice.name, selection.name) &&
        sameLang(voice.lang, selection.lang),
    );
    if (byNameAndLang >= 0) {
      return byNameAndLang;
    }
    const byName = voices.findIndex((voice) =>
      sameText(voice.name, selection.name),
    );
    if (byName >= 0) {
      return byName;
    }
  }
  return selectPreferredVoiceIndex(voices);
}

export type VoicePickerGroup = {
  id: "francais" | "autres";
  label: string;
  voices: readonly SpeechVoiceCandidate[];
};

/** FR-025 — françaises d'abord (fr-CA, fr-FR, autres fr), puis les autres langues. */
export function sortVoicesForPicker(
  voices: readonly SpeechVoiceCandidate[],
): VoicePickerGroup[] {
  const french: SpeechVoiceCandidate[] = [];
  const others: SpeechVoiceCandidate[] = [];
  for (const voice of voices) {
    if (frenchVoiceRank(voice.lang) < 3) {
      french.push(voice);
    } else {
      others.push(voice);
    }
  }

  french.sort((left, right) => {
    const rank = frenchVoiceRank(left.lang) - frenchVoiceRank(right.lang);
    return rank !== 0 ? rank : left.name.localeCompare(right.name, "fr");
  });
  others.sort((left, right) => {
    const lang = left.lang.localeCompare(right.lang, "fr");
    return lang !== 0 ? lang : left.name.localeCompare(right.name, "fr");
  });

  const groups: VoicePickerGroup[] = [];
  if (french.length > 0) {
    groups.push({ id: "francais", label: "Voix françaises", voices: french });
  }
  if (others.length > 0) {
    groups.push({ id: "autres", label: "Autres langues", voices: others });
  }
  return groups;
}
