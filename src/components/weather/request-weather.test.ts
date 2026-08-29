import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WEATHER_UNAVAILABLE_MESSAGE,
  requestWeather,
} from "./request-weather";

const center = { latitude: 45.5, longitude: -72.75 };

const report = {
  field: {
    center,
    radiusKm: 45,
    samples: [],
    observedAtIso: "2026-08-29T15:00:00.000Z",
  },
  radar: { frames: [], attribution: null },
  advice: {
    localRisk: 0,
    localLevel: "clear",
    sectors: [],
    avoid: null,
    escape: null,
    headline: "Ciel dégagé dans un rayon de 45 km.",
    detail: "Aucune pluie significative sur les directions échantillonnées.",
  },
};

function stubFetch(payload: unknown, status = 200) {
  const fetcher = vi.fn<typeof fetch>(async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestWeather (FR-043)", () => {
  it("asks the API for the sky around a point", async () => {
    const fetcher = stubFetch({ data: report });

    await expect(requestWeather(center)).resolves.toEqual(report);
    const url = new URL(String(fetcher.mock.calls[0]![0]), "http://localhost");
    expect(url.pathname).toBe("/api/weather");
    expect(url.searchParams.get("latitude")).toBe("45.5");
    expect(url.searchParams.get("longitude")).toBe("-72.75");
    expect(url.searchParams.get("radiusKm")).toBeNull();
  });

  it("passes a requested radius through", async () => {
    const fetcher = stubFetch({ data: report });

    await requestWeather(center, { radiusKm: 20 });

    const url = new URL(String(fetcher.mock.calls[0]![0]), "http://localhost");
    expect(url.searchParams.get("radiusKm")).toBe("20");
  });

  it("reports an unavailable service in French", async () => {
    stubFetch({ error: { code: "PROVIDER_ERROR" } }, 503);

    await expect(requestWeather(center)).rejects.toThrow(
      WEATHER_UNAVAILABLE_MESSAGE,
    );
  });

  it("refuses a success body with nothing in it", async () => {
    stubFetch({ meta: { requestId: "x" } });

    await expect(requestWeather(center)).rejects.toThrow(
      WEATHER_UNAVAILABLE_MESSAGE,
    );
  });

  it("forwards the abort signal so a stale request is dropped", async () => {
    const fetcher = stubFetch({ data: report });
    const controller = new AbortController();

    await requestWeather(center, { signal: controller.signal });

    expect(fetcher.mock.calls[0]![1]).toMatchObject({
      signal: controller.signal,
    });
  });
});
