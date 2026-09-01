import { describe, expect, it } from "vitest";
import type { SpeechVoiceCandidate } from "./voice";
import {
  DEFAULT_VOICE_PREFERENCES,
  VOICE_PREFERENCES_STORAGE_KEY,
  normalizeVoicePreferences,
  readStoredVoicePreferences,
  selectVoiceIndex,
  sortVoicesForPicker,
  writeStoredVoicePreferences,
  type VoicePreferences,
} from "./voice-preferences";

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    read: (key: string) => map.get(key) ?? null,
  };
}

const amelie: SpeechVoiceCandidate = {
  lang: "fr-CA",
  name: "Amélie",
  voiceURI: "com.apple.voice.compact.fr-CA.Amelie",
};
const thomas: SpeechVoiceCandidate = {
  lang: "fr-FR",
  name: "Thomas",
  voiceURI: "com.apple.voice.compact.fr-FR.Thomas",
};
const samantha: SpeechVoiceCandidate = {
  lang: "en-US",
  name: "Samantha",
  voiceURI: "com.apple.voice.compact.en-US.Samantha",
};

describe("normalizeVoicePreferences (FR-025)", () => {
  it("falls back to the defaults for anything that is not an object", () => {
    for (const value of [null, undefined, "abc", 12, []]) {
      expect(normalizeVoicePreferences(value)).toEqual(DEFAULT_VOICE_PREFERENCES);
    }
    expect(normalizeVoicePreferences({})).toEqual(DEFAULT_VOICE_PREFERENCES);
  });

  it("clamps the rate and the pitch to what the engine accepts", () => {
    expect(normalizeVoicePreferences({ rate: 9 }).rate).toBe(2);
    expect(normalizeVoicePreferences({ rate: 0.1 }).rate).toBe(0.5);
    expect(normalizeVoicePreferences({ pitch: -1 }).pitch).toBe(0);
    expect(normalizeVoicePreferences({ pitch: 5 }).pitch).toBe(2);
  });

  it("keeps a neutral rate and pitch for values that are not finite numbers", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, "1.2", null]) {
      expect(normalizeVoicePreferences({ rate: value, pitch: value })).toEqual({
        voice: null,
        rate: 1,
        pitch: 1,
      });
    }
  });

  it("drops a stored voice that has no usable name", () => {
    expect(normalizeVoicePreferences({ voice: { voiceURI: "x" } }).voice).toBeNull();
    expect(normalizeVoicePreferences({ voice: { name: "   " } }).voice).toBeNull();
    expect(normalizeVoicePreferences({ voice: { name: 12 } }).voice).toBeNull();
    expect(normalizeVoicePreferences({ voice: "Amélie" }).voice).toBeNull();
  });

  it("keeps a complete voice and tolerates missing optional fields", () => {
    expect(normalizeVoicePreferences({ voice: { name: "Thomas" } }).voice).toEqual({
      voiceURI: "",
      name: "Thomas",
      lang: "",
    });
  });
});

describe("stored voice preferences (FR-025)", () => {
  it("round-trips through storage", () => {
    const storage = fakeStorage();
    const value: VoicePreferences = {
      voice: { voiceURI: thomas.voiceURI ?? "", name: "Thomas", lang: "fr-FR" },
      rate: 1.2,
      pitch: 0.8,
    };
    writeStoredVoicePreferences(storage, value);
    expect(readStoredVoicePreferences(storage)).toEqual(value);
  });

  it("normalizes what it writes", () => {
    const storage = fakeStorage();
    writeStoredVoicePreferences(storage, {
      voice: null,
      rate: 99,
      pitch: -4,
    });
    expect(
      JSON.parse(storage.read(VOICE_PREFERENCES_STORAGE_KEY) ?? "{}"),
    ).toEqual({ voice: null, rate: 2, pitch: 0 });
  });

  it("falls back to the defaults for corrupted or empty content", () => {
    expect(
      readStoredVoicePreferences(
        fakeStorage({ [VOICE_PREFERENCES_STORAGE_KEY]: "{oops" }),
      ),
    ).toEqual(DEFAULT_VOICE_PREFERENCES);
    expect(
      readStoredVoicePreferences(
        fakeStorage({ [VOICE_PREFERENCES_STORAGE_KEY]: "   " }),
      ),
    ).toEqual(DEFAULT_VOICE_PREFERENCES);
  });

  it("treats a missing storage as the defaults and writes nothing", () => {
    expect(readStoredVoicePreferences(null)).toEqual(DEFAULT_VOICE_PREFERENCES);
    expect(() =>
      writeStoredVoicePreferences(null, DEFAULT_VOICE_PREFERENCES),
    ).not.toThrow();
  });

  it("survives a storage that throws, the way Safari private mode does", () => {
    expect(
      readStoredVoicePreferences({
        getItem: () => {
          throw new Error("denied");
        },
      }),
    ).toEqual(DEFAULT_VOICE_PREFERENCES);
  });
});

describe("selectVoiceIndex (FR-025)", () => {
  const voices = [samantha, amelie, thomas];

  it("matches the stored voiceURI", () => {
    expect(
      selectVoiceIndex(voices, {
        voiceURI: thomas.voiceURI ?? "",
        name: "Thomas",
        lang: "fr-FR",
      }),
    ).toBe(2);
  });

  it("matches on name and lang when iOS rewrote the voiceURI", () => {
    expect(
      selectVoiceIndex(voices, {
        voiceURI: "com.apple.ttsbundle.Thomas-compact",
        name: "Thomas",
        lang: "FR-fr",
      }),
    ).toBe(2);
  });

  it("matches on the name alone when the lang also changed", () => {
    expect(
      selectVoiceIndex(voices, {
        voiceURI: "gone",
        name: "Thomas",
        lang: "fr-BE",
      }),
    ).toBe(2);
  });

  it("falls back to the automatic ranking when the stored voice is gone", () => {
    expect(
      selectVoiceIndex(voices, {
        voiceURI: "gone",
        name: "Chantal",
        lang: "fr-CA",
      }),
    ).toBe(1);
  });

  it("uses the automatic ranking with no selection, and -1 with no voice", () => {
    expect(selectVoiceIndex(voices, null)).toBe(1);
    expect(selectVoiceIndex([], null)).toBe(-1);
    expect(
      selectVoiceIndex([], { voiceURI: "x", name: "Thomas", lang: "fr-FR" }),
    ).toBe(-1);
  });
});

describe("sortVoicesForPicker (FR-025)", () => {
  it("puts French first, ranked, and groups the other languages", () => {
    const belge: SpeechVoiceCandidate = { lang: "fr-BE", name: "Sophie" };
    const groups = sortVoicesForPicker([samantha, belge, thomas, amelie]);
    expect(groups.map((group) => group.id)).toEqual(["francais", "autres"]);
    expect(groups[0].voices.map((voice) => voice.name)).toEqual([
      "Amélie",
      "Thomas",
      "Sophie",
    ]);
    expect(groups[1].voices.map((voice) => voice.name)).toEqual(["Samantha"]);
  });

  it("sorts the other languages by lang then name", () => {
    const groups = sortVoicesForPicker([
      { lang: "es-ES", name: "Monica" },
      { lang: "en-US", name: "Victoria" },
      { lang: "en-US", name: "Samantha" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].voices.map((voice) => voice.name)).toEqual([
      "Samantha",
      "Victoria",
      "Monica",
    ]);
  });

  it("omits an empty group", () => {
    expect(sortVoicesForPicker([])).toEqual([]);
    expect(sortVoicesForPicker([samantha]).map((group) => group.id)).toEqual([
      "autres",
    ]);
    expect(sortVoicesForPicker([amelie]).map((group) => group.id)).toEqual([
      "francais",
    ]);
  });
});
