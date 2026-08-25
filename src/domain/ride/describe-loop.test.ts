import { describe, expect, it } from "vitest";
import {
  DESCRIBE_LOOP_DEFAULT,
  DESCRIBE_LOOP_STORAGE_KEY,
  readStoredDescribeLoop,
  writeStoredDescribeLoop,
} from "./describe-loop";

describe("stored describe loop (FR-034)", () => {
  it("defaults to a loop that returns to the start", () => {
    expect(readStoredDescribeLoop(null)).toBe(DESCRIBE_LOOP_DEFAULT);
    expect(readStoredDescribeLoop({ getItem: () => null })).toBe(true);
  });

  it("persists the last Boucle switch value", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };
    writeStoredDescribeLoop(storage, false);
    expect(store.get(DESCRIBE_LOOP_STORAGE_KEY)).toBe("false");
    expect(readStoredDescribeLoop(storage)).toBe(false);
    writeStoredDescribeLoop(storage, true);
    expect(readStoredDescribeLoop(storage)).toBe(true);
  });
});
