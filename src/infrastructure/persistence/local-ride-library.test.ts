import { describe, expect, it } from "vitest";
import {
  createLocalRideLibrary,
  createMemoryRideLibrary,
  RIDE_LIBRARY_STORAGE_KEY,
} from "./local-ride-library";

const granby = {
  label: "Granby, QC",
  coordinates: { latitude: 45.4, longitude: -72.73 },
};

describe("local ride library (FR-035)", () => {
  it("persists recents without storing GPS crumbs", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };
    const library = createLocalRideLibrary(storage);
    library.rememberPlace(granby);
    expect(library.listRecents()[0]).toEqual(granby);
    expect(store.get(RIDE_LIBRARY_STORAGE_KEY)).toContain("Granby");
    expect(store.get(RIDE_LIBRARY_STORAGE_KEY)).not.toContain("accuracy");
  });

  it("works in memory when storage is unavailable", () => {
    const library = createMemoryRideLibrary();
    library.rememberPlace(granby);
    expect(library.listRecents()).toHaveLength(1);
  });
});
