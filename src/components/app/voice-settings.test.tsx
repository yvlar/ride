import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VoiceSettings } from "./voice-settings";
import {
  VOICE_PREVIEW_SENTENCE,
  VOICE_UNAVAILABLE_SETTINGS_NOTE,
} from "@/domain/navigation/session-copy";
import { DEFAULT_VOICE_PREFERENCES } from "@/domain/navigation/voice-preferences";
import type { SpeechVoiceCandidate } from "@/domain/navigation/voice";
import type { SpeechGuidance } from "@/infrastructure/voice/speech-guidance";

const VOICES: SpeechVoiceCandidate[] = [
  { lang: "en-US", name: "Samantha", voiceURI: "en-US.Samantha" },
  { lang: "fr-FR", name: "Thomas", voiceURI: "fr-FR.Thomas" },
  { lang: "fr-CA", name: "Amélie", voiceURI: "fr-CA.Amelie" },
];

function stubSpeech(overrides: Partial<SpeechGuidance> = {}): SpeechGuidance {
  return {
    available: true,
    speak: vi.fn(),
    cancel: vi.fn(),
    setMuted: vi.fn(),
    unlock: vi.fn(),
    listVoices: () => VOICES,
    subscribeVoices: () => () => {},
    ...overrides,
  };
}

describe("VoiceSettings (FR-025)", () => {
  it("starts on the automatic ranking", () => {
    render(
      <VoiceSettings
        value={DEFAULT_VOICE_PREFERENCES}
        onChange={() => {}}
        speech={stubSpeech()}
      />,
    );
    expect(
      screen.getByRole("radio", { name: /Automatique/ }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("lists the French voices first, then the other languages", () => {
    render(
      <VoiceSettings
        value={DEFAULT_VOICE_PREFERENCES}
        onChange={() => {}}
        speech={stubSpeech()}
      />,
    );
    expect(screen.getByText("Voix françaises")).toBeInTheDocument();
    expect(screen.getByText("Autres langues")).toBeInTheDocument();

    const names = screen
      .getAllByRole("radio")
      .map((radio) => radio.textContent ?? "");
    expect(names[0]).toContain("Automatique");
    expect(names[1]).toContain("Amélie");
    expect(names[2]).toContain("Thomas");
    expect(names[3]).toContain("Samantha");
  });

  it("reports the full selection when a voice is picked", () => {
    const onChange = vi.fn();
    render(
      <VoiceSettings
        value={DEFAULT_VOICE_PREFERENCES}
        onChange={onChange}
        speech={stubSpeech()}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Thomas/ }));
    expect(onChange).toHaveBeenCalledWith({
      voice: { voiceURI: "fr-FR.Thomas", name: "Thomas", lang: "fr-FR" },
      rate: 1,
      pitch: 1,
    });
  });

  it("reports the rate and the pitch", () => {
    const onChange = vi.fn();
    render(
      <VoiceSettings
        value={DEFAULT_VOICE_PREFERENCES}
        onChange={onChange}
        speech={stubSpeech()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Lent" }));
    expect(onChange).toHaveBeenCalledWith({ voice: null, rate: 0.85, pitch: 1 });

    fireEvent.click(screen.getByRole("button", { name: "Grave" }));
    expect(onChange).toHaveBeenCalledWith({ voice: null, rate: 1, pitch: 0.8 });
  });

  it("marks the stored voice as selected", () => {
    render(
      <VoiceSettings
        value={{
          voice: { voiceURI: "fr-FR.Thomas", name: "Thomas", lang: "fr-FR" },
          rate: 1,
          pitch: 1,
        }}
        onChange={() => {}}
        speech={stubSpeech()}
      />,
    );
    expect(screen.getByRole("radio", { name: /Thomas/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: /Automatique/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("unlocks the engine and speaks the pending selection on Essayer", () => {
    const speech = stubSpeech();
    const value = {
      voice: { voiceURI: "fr-FR.Thomas", name: "Thomas", lang: "fr-FR" },
      rate: 1.2,
      pitch: 1,
    };
    render(
      <VoiceSettings value={value} onChange={() => {}} speech={speech} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Essayer la voix" }));

    expect(speech.unlock).toHaveBeenCalled();
    expect(speech.setMuted).toHaveBeenCalledWith(false);
    expect(speech.speak).toHaveBeenCalledWith(VOICE_PREVIEW_SENTENCE, {
      preferences: value,
    });
  });

  it("names the missing engine rather than looking silent by choice (FR-044)", () => {
    render(
      <VoiceSettings
        value={DEFAULT_VOICE_PREFERENCES}
        onChange={() => {}}
        speech={stubSpeech({ available: false, listVoices: () => [] })}
      />,
    );
    expect(screen.getByRole("button", { name: "Essayer la voix" })).toBeDisabled();
    expect(
      screen.getByText(VOICE_UNAVAILABLE_SETTINGS_NOTE),
    ).toBeInTheDocument();
  });

  it("still renders with an adapter that publishes no voice list", () => {
    render(
      <VoiceSettings
        value={DEFAULT_VOICE_PREFERENCES}
        onChange={() => {}}
        speech={stubSpeech({
          listVoices: undefined,
          subscribeVoices: undefined,
        })}
      />,
    );
    expect(screen.getAllByRole("radio")).toHaveLength(1);
    expect(
      screen.getByText("Les voix de l’appareil apparaîtront ici."),
    ).toBeInTheDocument();
  });
});
