import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAP_THEME,
  isMapTheme,
  MAP_THEME_STORAGE_KEY,
  readStoredMapTheme,
  resolveMapTheme,
  writeStoredMapTheme,
} from "./map-theme";

function storageWith(value: string | null) {
  return { getItem: () => value };
}

describe("map theme storage (FR-045)", () => {
  it("defaults to automatique without storage", () => {
    expect(readStoredMapTheme(null)).toBe("auto");
    expect(DEFAULT_MAP_THEME).toBe("auto");
  });

  it("reads a stored theme", () => {
    expect(readStoredMapTheme(storageWith("satellite"))).toBe("satellite");
    expect(readStoredMapTheme(storageWith("terrain"))).toBe("terrain");
    expect(readStoredMapTheme(storageWith("kart-arcade"))).toBe("kart-arcade");
  });

  it("falls back to the default on an unknown value", () => {
    expect(readStoredMapTheme(storageWith("bleu"))).toBe("auto");
    expect(readStoredMapTheme(storageWith(null))).toBe("auto");
  });

  it("writes under the durable settings key", () => {
    const written: [string, string][] = [];
    writeStoredMapTheme(
      { setItem: (key, value) => written.push([key, value]) },
      "dark",
    );
    expect(written).toEqual([[MAP_THEME_STORAGE_KEY, "dark"]]);
  });

  it("tolerates a missing storage on write", () => {
    expect(() => writeStoredMapTheme(null, "light")).not.toThrow();
  });
});

describe("resolveMapTheme (FR-045, FR-037)", () => {
  it("follows the appearance when automatique", () => {
    expect(resolveMapTheme("auto", "light")).toBe("light");
    expect(resolveMapTheme("auto", "dark")).toBe("dark");
    expect(resolveMapTheme("auto", "night")).toBe("dark");
  });

  it("keeps an explicit choice whatever the appearance", () => {
    expect(resolveMapTheme("satellite", "light")).toBe("satellite");
    expect(resolveMapTheme("light", "night")).toBe("light");
  });
});

describe("Kart Arcade (FR-046)", () => {
  it("is a theme the rider can pick", () => {
    expect(isMapTheme("kart-arcade")).toBe(true);
  });

  it("is never chosen for an existing rider by default", () => {
    expect(DEFAULT_MAP_THEME).toBe("auto");
    expect(readStoredMapTheme(null)).toBe("auto");
    expect(readStoredMapTheme(storageWith(null))).toBe("auto");
    // Automatique follows the appearance and never resolves to the arcade.
    expect(resolveMapTheme("auto", "light")).toBe("light");
    expect(resolveMapTheme("auto", "dark")).toBe("dark");
  });

  it("is restored when it is what the rider stored", () => {
    expect(readStoredMapTheme(storageWith("kart-arcade"))).toBe("kart-arcade");
    expect(resolveMapTheme("kart-arcade", "light")).toBe("kart-arcade");
    expect(resolveMapTheme("kart-arcade", "dark")).toBe("kart-arcade");
  });
});
