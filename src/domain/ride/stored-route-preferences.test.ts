import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROUTE_PREFERENCES,
  ROUTE_PREFERENCES_STORAGE_KEY,
  readStoredRoutePreferences,
  writeStoredRoutePreferences,
} from "./stored-route-preferences";

describe("stored route preferences (FR-007, FR-008, FR-030, FR-031)", () => {
  it("defaults to avoiding highways and unpaved roads", () => {
    expect(readStoredRoutePreferences(null)).toEqual(DEFAULT_ROUTE_PREFERENCES);
    expect(readStoredRoutePreferences({ getItem: () => null })).toEqual({
      avoidHighways: true,
      avoidUnpaved: true,
      stayInCanada: false,
    });
  });

  it("persists the last chosen settings", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };
    writeStoredRoutePreferences(storage, {
      avoidHighways: false,
      avoidUnpaved: true,
      stayInCanada: true,
    });
    expect(store.get(ROUTE_PREFERENCES_STORAGE_KEY)).toMatch(/stayInCanada/);
    expect(readStoredRoutePreferences(storage)).toEqual({
      avoidHighways: false,
      avoidUnpaved: true,
      stayInCanada: true,
    });
  });

  it("falls back to defaults on invalid stored JSON", () => {
    expect(
      readStoredRoutePreferences({ getItem: () => "not-json" }),
    ).toEqual(DEFAULT_ROUTE_PREFERENCES);
  });
});
