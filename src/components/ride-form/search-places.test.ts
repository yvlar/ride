import { afterEach, describe, expect, it, vi } from "vitest";
import { searchPlacesFromApi } from "./search-places";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("searchPlacesFromApi (FR-032)", () => {
  it("forwards the abort signal so a newer query can cancel the previous one", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(JSON.stringify({ data: { places: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    await searchPlacesFromApi("Granby", controller.signal);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
