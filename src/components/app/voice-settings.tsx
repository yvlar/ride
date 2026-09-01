"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  VOICE_PREVIEW_SENTENCE,
  VOICE_UNAVAILABLE_SETTINGS_NOTE,
} from "@/domain/navigation/session-copy";
import type { SpeechVoiceCandidate } from "@/domain/navigation/voice";
import {
  VOICE_PITCH_OPTIONS,
  VOICE_RATE_OPTIONS,
  sortVoicesForPicker,
  type VoicePreferences,
  type VoiceSelection,
} from "@/domain/navigation/voice-preferences";
import type { SpeechGuidance } from "@/infrastructure/voice/speech-guidance";
import { cn } from "@/lib/utils";

const NO_VOICES: readonly SpeechVoiceCandidate[] = [];

/**
 * FR-025 — `getVoices()` is empty on the first calls and fills in later through
 * `voiceschanged`, so the list is read from the engine rather than at render.
 */
function useSpeechVoices(speech: SpeechGuidance) {
  const [voices, setVoices] = useState<readonly SpeechVoiceCandidate[]>(NO_VOICES);

  useEffect(() => {
    const read = () => setVoices(speech.listVoices?.() ?? NO_VOICES);
    read();
    const unsubscribe = speech.subscribeVoices?.(read);
    return unsubscribe;
  }, [speech]);

  return voices;
}

function selectionOf(voice: SpeechVoiceCandidate): VoiceSelection {
  return {
    voiceURI: voice.voiceURI ?? "",
    name: voice.name,
    lang: voice.lang,
  };
}

function isSelected(
  selection: VoiceSelection,
  voice: SpeechVoiceCandidate,
): boolean {
  if (!selection) {
    return false;
  }
  const uri = voice.voiceURI ?? "";
  if (uri !== "" && selection.voiceURI !== "") {
    return uri === selection.voiceURI;
  }
  return selection.name === voice.name && selection.lang === voice.lang;
}

function ScaleSetting({
  legend,
  options,
  value,
  onSelect,
}: {
  legend: string;
  options: readonly { value: number; label: string }[];
  value: number;
  onSelect: (next: number) => void;
}) {
  return (
    <fieldset className="mt-4 space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.label}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(option.value)}
              className={cn(
                "min-h-12 rounded-2xl border px-3 py-2 text-sm font-semibold transition-colors",
                selected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border/70 bg-background/45 text-muted-foreground",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function VoiceSettings({
  value,
  onChange,
  speech,
  idPrefix = "settings",
}: {
  value: VoicePreferences;
  onChange: (next: VoicePreferences) => void;
  speech: SpeechGuidance;
  idPrefix?: string;
}) {
  const voices = useSpeechVoices(speech);
  const groups = sortVoicesForPicker(voices);

  function preview() {
    // The click itself is the user gesture iOS requires, and `unlock()` also
    // publishes the voice list on an engine that was never touched (FR-025).
    speech.unlock();
    // A previous ride may have left the shared engine muted; the next session
    // re-applies its own mute when it mounts.
    speech.setMuted(false);
    speech.cancel();
    speech.speak(VOICE_PREVIEW_SENTENCE, { preferences: value });
  }

  return (
    <div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Voix</legend>
        <div
          role="radiogroup"
          aria-label="Voix de navigation"
          className="max-h-80 space-y-2 overflow-y-auto"
        >
          <button
            type="button"
            role="radio"
            aria-checked={value.voice === null}
            className={cn(
              "ride-control-row flex w-full items-center text-left text-base",
              value.voice === null &&
                "border-primary bg-primary text-primary-foreground",
            )}
            onClick={() => onChange({ ...value, voice: null })}
          >
            Automatique (recommandé)
          </button>
          {groups.map((group) => (
            <div key={group.id} className="space-y-2 pt-2">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                {group.label}
              </p>
              {group.voices.map((voice) => {
                const selected = isSelected(value.voice, voice);
                return (
                  <button
                    key={`${voice.voiceURI ?? ""}|${voice.name}|${voice.lang}`}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={cn(
                      "ride-control-row flex w-full flex-col items-start text-left text-base",
                      selected &&
                        "border-primary bg-primary text-primary-foreground",
                    )}
                    onClick={() =>
                      onChange({ ...value, voice: selectionOf(voice) })
                    }
                  >
                    <span>{voice.name}</span>
                    <span className="text-xs opacity-80">{voice.lang}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Les voix de l’appareil apparaîtront ici.
            </p>
          ) : null}
        </div>
      </fieldset>

      <ScaleSetting
        legend="Débit de la voix"
        options={VOICE_RATE_OPTIONS}
        value={value.rate}
        onSelect={(rate) => onChange({ ...value, rate })}
      />
      <ScaleSetting
        legend="Hauteur de la voix"
        options={VOICE_PITCH_OPTIONS}
        value={value.pitch}
        onSelect={(pitch) => onChange({ ...value, pitch })}
      />

      <Button
        type="button"
        variant="outline"
        id={`${idPrefix}-voice-preview`}
        className="mt-4 min-h-12"
        disabled={!speech.available}
        onClick={preview}
      >
        Essayer la voix
      </Button>
      {speech.available ? null : (
        <p className="mt-2 text-sm text-muted-foreground">
          {VOICE_UNAVAILABLE_SETTINGS_NOTE}
        </p>
      )}
    </div>
  );
}
