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

  it("normalizes Canadian postal codes and forwards a soft proximity bias", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      void url;
      return new Response(JSON.stringify({ data: { places: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await searchPlacesFromApi("j2g2w4", undefined, {
      latitude: 45.4001,
      longitude: -72.7342,
    });

    const requested = new URL(String(fetchMock.mock.calls[0]?.[0]), "http://ride.test");
    expect(requested.searchParams.get("q")).toBe("J2G 2W4");
    expect(requested.searchParams.get("latitude")).toBe("45.4001");
    expect(requested.searchParams.get("longitude")).toBe("-72.7342");
  });
});
