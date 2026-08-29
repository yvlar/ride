import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { weatherDirectionAdvice } from "@/domain/weather/weather-directions";
import { WEATHER_ATTRIBUTION } from "@/domain/weather/types";
import { offsetCoordinates } from "@/domain/geo/distance";
import type { WeatherOverlay } from "@/domain/weather/types";
import type { WeatherOverlayState } from "./use-weather-overlay";
import {
  WEATHER_LOADING_MESSAGE,
  WEATHER_NO_POSITION_MESSAGE,
  WEATHER_TOGGLE_LABEL,
  WeatherMapControl,
} from "./weather-map-control";

const GRANBY = { latitude: 45.4001, longitude: -72.7342 };
const NOW = Date.parse("2026-08-29T14:05:00.000Z");

function overlay(): WeatherOverlay {
  return {
    center: GRANBY,
    radiusKm: 60,
    observedAt: "2026-08-29T14:00:00.000Z",
    samples: [
      {
        coordinates: GRANBY,
        precipitationProbability: 90,
        precipitationMmPerHour: 2,
        temperatureC: 16,
        windKph: 20,
      },
      {
        coordinates: offsetCoordinates(GRANBY, 225, 60),
        precipitationProbability: 85,
        precipitationMmPerHour: 2,
        temperatureC: 16,
        windKph: 20,
      },
      {
        coordinates: offsetCoordinates(GRANBY, 45, 60),
        precipitationProbability: 5,
        precipitationMmPerHour: 0,
        temperatureC: 19,
        windKph: 10,
      },
    ],
  };
}

function state(overrides: Partial<WeatherOverlayState> = {}): WeatherOverlayState {
  const nappe = "overlay" in overrides ? overrides.overlay! : overlay();
  return {
    overlay: nappe,
    advice: weatherDirectionAdvice(nappe),
    status: "ready",
    error: null,
    refresh: vi.fn(),
    ...overrides,
  };
}

function renderControl(props: Partial<Parameters<typeof WeatherMapControl>[0]> = {}) {
  const onEnabledChange = vi.fn();
  render(
    <WeatherMapControl
      enabled
      onEnabledChange={onEnabledChange}
      state={state()}
      hasCenter
      now={() => NOW}
      {...props}
    />,
  );
  return { onEnabledChange };
}

describe("bandeau météo (FR-043)", () => {
  it("nomme la direction à éviter et celle à privilégier", () => {
    renderControl();

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("vers le sud-ouest");
    expect(status).toHaveTextContent("Meilleure direction : nord-est");
  });

  it("signale la pluie sur la position du pilote", () => {
    renderControl();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Pluie sur votre position (90 %).",
    );
  });

  it("date le relevé et en cite la source", () => {
    renderControl();

    expect(screen.getByRole("status")).toHaveTextContent(
      `${WEATHER_ATTRIBUTION} · relevé il y a 5 min`,
    );
  });

  it("s’allume et s’éteint à la demande du pilote", () => {
    const { onEnabledChange } = renderControl({ enabled: false });

    const toggle = screen.getByRole("button", { name: WEATHER_TOGGLE_LABEL });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("status")).toBeNull();

    fireEvent.click(toggle);

    expect(onEnabledChange).toHaveBeenCalledWith(true);
  });

  it("explique une position inconnue au lieu d’inventer un secteur", () => {
    renderControl({
      hasCenter: false,
      state: state({ overlay: null, status: "idle" }),
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      WEATHER_NO_POSITION_MESSAGE,
    );
  });

  it("affiche l’attente du premier relevé seulement", () => {
    renderControl({ state: state({ overlay: null, status: "loading" }) });
    expect(screen.getByRole("status")).toHaveTextContent(
      WEATHER_LOADING_MESSAGE,
    );

    screen.getByRole("status").remove();
    renderControl({ state: state({ status: "loading" }) });
    expect(screen.getByRole("status")).toHaveTextContent("vers le sud-ouest");
  });

  it("garde le dernier relevé daté et propose de réessayer après une panne", () => {
    const refresh = vi.fn();
    renderControl({
      state: state({ status: "error", error: "Météo indisponible.", refresh }),
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Météo indisponible · dernier relevé il y a 5 min",
    );
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(refresh).toHaveBeenCalled();
  });

  it("annonce un relevé périmé plutôt que de le faire passer pour actuel", () => {
    renderControl({ now: () => NOW + 60 * 60_000 });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Relevé périmé il y a 1 h",
    );
  });

  it("affiche le message d’erreur quand aucun relevé n’a abouti", () => {
    renderControl({
      state: state({
        overlay: null,
        status: "error",
        error: "Météo indisponible pour le moment.",
      }),
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Météo indisponible pour le moment.",
    );
  });
});
