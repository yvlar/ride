import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Coordinates } from "@/domain/geo/types";
import type { WeatherSample } from "@/domain/weather/types";
import { weatherSampleGrid } from "@/domain/weather/sample-grid";
import type { WeatherReport } from "./request-weather";
import { WEATHER_REFRESH_MS, useWeatherWatch } from "./use-weather-watch";

const center: Coordinates = { latitude: 45.5, longitude: -72.75 };

/** Rain due south of the sampled centre, dry everywhere else. */
function reportFor(anchor: Coordinates): WeatherReport {
  const samples: WeatherSample[] = weatherSampleGrid(anchor, 40).map(
    (coordinates, index) => ({
      coordinates,
      precipitationProbability: index === 13 ? 90 : 5,
      precipitationMmPerHour: index === 13 ? 4 : 0,
      cloudCover: index === 13 ? 95 : 10,
      thunder: false,
      temperatureC: 19,
      windSpeedKmh: 12,
    }),
  );

  return {
    field: {
      center: anchor,
      radiusKm: 40,
      samples,
      observedAtIso: "2026-08-29T15:00:00.000Z",
    },
    radar: { frames: [], attribution: null, maxZoom: null },
    advice: {
      localRisk: 0,
      localLevel: "clear",
      sectors: [],
      avoid: null,
      escape: null,
      headline: "serveur",
      detail: "serveur",
    },
  };
}

function Probe({
  enabled,
  position,
  load,
}: {
  enabled: boolean;
  position: Coordinates | null;
  load: (center: Coordinates) => Promise<WeatherReport>;
}) {
  const watch = useWeatherWatch({ enabled, center: position, load });
  return (
    <div>
      <p data-testid="status">{watch.status}</p>
      <p data-testid="headline">{watch.advice?.headline ?? "—"}</p>
      <p data-testid="avoid">{watch.advice?.avoid?.sector ?? "—"}</p>
      <p data-testid="error">{watch.error ?? "—"}</p>
    </div>
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useWeatherWatch (FR-043)", () => {
  it("fetches nothing while the layer is off", async () => {
    const load = vi.fn(async (anchor: Coordinates) => reportFor(anchor));

    render(<Probe enabled={false} position={center} load={load} />);

    expect(load).not.toHaveBeenCalled();
    expect(screen.getByTestId("status")).toHaveTextContent("idle");
  });

  it("reads the field once the rider turns the layer on", async () => {
    const load = vi.fn(async (anchor: Coordinates) => reportFor(anchor));

    render(<Probe enabled position={center} load={load} />);

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("ready");
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("avoid")).toHaveTextContent("S");
  });

  it("computes the advice locally, not from the server sentence", async () => {
    const load = vi.fn(async (anchor: Coordinates) => reportFor(anchor));

    render(<Probe enabled position={center} load={load} />);

    await waitFor(() => {
      expect(screen.getByTestId("headline")).not.toHaveTextContent("serveur");
    });
    expect(screen.getByTestId("headline")).toHaveTextContent("sud");
  });

  it("does not refetch while the rider stays in the same cell", async () => {
    const load = vi.fn(async (anchor: Coordinates) => reportFor(anchor));
    const view = render(<Probe enabled position={center} load={load} />);

    await waitFor(() => {
      expect(load).toHaveBeenCalledTimes(1);
    });
    view.rerender(
      <Probe
        enabled
        position={{ latitude: 45.52, longitude: -72.72 }}
        load={load}
      />,
    );
    view.rerender(
      <Probe
        enabled
        position={{ latitude: 45.47, longitude: -72.68 }}
        load={load}
      />,
    );

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("refetches once the rider has actually moved on", async () => {
    const load = vi.fn(async (anchor: Coordinates) => reportFor(anchor));
    const view = render(<Probe enabled position={center} load={load} />);

    await waitFor(() => {
      expect(load).toHaveBeenCalledTimes(1);
    });
    view.rerender(
      <Probe
        enabled
        position={{ latitude: 46.1, longitude: -72.72 }}
        load={load}
      />,
    );

    await waitFor(() => {
      expect(load).toHaveBeenCalledTimes(2);
    });
    expect(load.mock.calls[1]![0]).toEqual({
      latitude: 46.1,
      longitude: -72.7,
    });
  });

  it("refreshes on its own so the sky stays current", async () => {
    const load = vi.fn(async (anchor: Coordinates) => reportFor(anchor));
    render(<Probe enabled position={center} load={load} />);

    await waitFor(() => {
      expect(load).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      vi.advanceTimersByTime(WEATHER_REFRESH_MS);
    });

    await waitFor(() => {
      expect(load).toHaveBeenCalledTimes(2);
    });
  });

  it("stops refreshing once the layer goes off", async () => {
    const load = vi.fn(async (anchor: Coordinates) => reportFor(anchor));
    const view = render(<Probe enabled position={center} load={load} />);

    await waitFor(() => {
      expect(load).toHaveBeenCalledTimes(1);
    });
    view.rerender(<Probe enabled={false} position={center} load={load} />);
    await act(async () => {
      vi.advanceTimersByTime(WEATHER_REFRESH_MS * 3);
    });

    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("status")).toHaveTextContent("idle");
  });

  it("surfaces a failure instead of an empty sky", async () => {
    const load = vi.fn(async () => {
      throw new Error("Les données météo ne sont pas disponibles.");
    });

    render(<Probe enabled position={center} load={load} />);

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("error");
    });
    expect(screen.getByTestId("error")).toHaveTextContent(
      "Les données météo ne sont pas disponibles.",
    );
  });

  it("waits for a position before asking anything", async () => {
    const load = vi.fn(async (anchor: Coordinates) => reportFor(anchor));

    render(<Probe enabled position={null} load={load} />);

    expect(load).not.toHaveBeenCalled();
    expect(screen.getByTestId("status")).toHaveTextContent("loading");
  });
});
