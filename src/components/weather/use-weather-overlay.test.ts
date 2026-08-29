import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { offsetCoordinates } from "@/domain/geo/distance";
import type { Coordinates } from "@/domain/geo/types";
import type { WeatherOverlay } from "@/domain/weather/types";
import type { RequestWeatherOverlay } from "./request-weather-overlay";
import { useWeatherOverlay } from "./use-weather-overlay";

const GRANBY: Coordinates = { latitude: 45.4001, longitude: -72.7342 };

function overlayAt(center: Coordinates, probability: number): WeatherOverlay {
  return {
    center,
    radiusKm: 60,
    observedAt: "2026-08-29T14:00:00.000Z",
    samples: [
      {
        coordinates: offsetCoordinates(center, 225, 60),
        precipitationProbability: probability,
        precipitationMmPerHour: null,
        temperatureC: 18,
        windKph: 12,
      },
      {
        coordinates: offsetCoordinates(center, 45, 60),
        precipitationProbability: 5,
        precipitationMmPerHour: null,
        temperatureC: 18,
        windKph: 12,
      },
    ],
  };
}

describe("useWeatherOverlay (FR-043)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ne relève rien tant que le pilote n’a pas allumé la couche", async () => {
    const request = vi.fn(async () =>
      overlayAt(GRANBY, 80),
    ) as unknown as RequestWeatherOverlay;

    const { result } = renderHook(() =>
      useWeatherOverlay({ enabled: false, center: GRANBY, request }),
    );

    expect(request).not.toHaveBeenCalled();
    expect(result.current.overlay).toBeNull();
    expect(result.current.status).toBe("idle");
  });

  it("relève la météo à l’allumage et en tire la direction à éviter", async () => {
    const request = vi.fn(async () => overlayAt(GRANBY, 80));

    const { result } = renderHook(() =>
      useWeatherOverlay({
        enabled: true,
        center: GRANBY,
        request: request as unknown as RequestWeatherOverlay,
      }),
    );

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(result.current.overlay?.samples).toHaveLength(2);
    expect(result.current.advice.worst?.id).toBe("SO");
    expect(result.current.advice.best?.id).toBe("NE");
  });

  it("ne relance rien pour quelques kilomètres, mais suit un vrai déplacement", async () => {
    const request = vi.fn(async (center: Coordinates) => overlayAt(center, 60));
    const { result, rerender } = renderHook(
      ({ center }: { center: Coordinates }) =>
        useWeatherOverlay({
          enabled: true,
          center,
          request: request as unknown as RequestWeatherOverlay,
        }),
      { initialProps: { center: GRANBY } },
    );

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    rerender({ center: offsetCoordinates(GRANBY, 90, 5) });
    expect(request).toHaveBeenCalledTimes(1);

    rerender({ center: offsetCoordinates(GRANBY, 90, 40) });
    await waitFor(() => {
      expect(request).toHaveBeenCalledTimes(2);
    });
  });

  it("rafraîchit le relevé à intervalle régulier en roulant", async () => {
    const request = vi.fn(async () => overlayAt(GRANBY, 40));
    const { result } = renderHook(() =>
      useWeatherOverlay({
        enabled: true,
        center: GRANBY,
        refreshMs: 60_000,
        request: request as unknown as RequestWeatherOverlay,
      }),
    );

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    await waitFor(() => {
      expect(request).toHaveBeenCalledTimes(2);
    });
  });

  it("garde le dernier relevé quand le fournisseur tombe", async () => {
    const request = vi
      .fn<RequestWeatherOverlay>()
      .mockResolvedValueOnce(overlayAt(GRANBY, 70))
      .mockRejectedValueOnce(new Error("Météo indisponible."));

    const { result } = renderHook(() =>
      useWeatherOverlay({
        enabled: true,
        center: GRANBY,
        refreshMs: 60_000,
        request,
      }),
    );

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current.error).toBe("Météo indisponible.");
    expect(result.current.overlay).not.toBeNull();
  });

  it("éteint la couche sans laisser une réponse en vol la rallumer", async () => {
    let resolveRequest: ((overlay: WeatherOverlay) => void) | undefined;
    const request = vi.fn(
      () =>
        new Promise<WeatherOverlay>((resolve) => {
          resolveRequest = resolve;
        }),
    ) as unknown as RequestWeatherOverlay;

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useWeatherOverlay({ enabled, center: GRANBY, request }),
      { initialProps: { enabled: true } },
    );

    rerender({ enabled: false });
    await act(async () => {
      resolveRequest?.(overlayAt(GRANBY, 90));
    });

    expect(result.current.overlay).toBeNull();
    expect(result.current.status).toBe("idle");
  });

  it("ne relève rien sans position connue", async () => {
    const request = vi.fn(async () =>
      overlayAt(GRANBY, 50),
    ) as unknown as RequestWeatherOverlay;

    renderHook(() =>
      useWeatherOverlay({ enabled: true, center: null, request }),
    );

    expect(request).not.toHaveBeenCalled();
  });
});
