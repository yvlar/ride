import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WeatherEscapeAdvice } from "@/domain/weather/escape-direction";
import type { WeatherReport } from "./request-weather";
import {
  WEATHER_COLLAPSE_LABEL,
  WEATHER_EXPAND_LABEL,
  WEATHER_LOADING_MESSAGE,
  WEATHER_NO_RADAR_MESSAGE,
  WEATHER_TOGGLE_LABEL,
  WeatherMapControl,
} from "./weather-map-control";

const advice: WeatherEscapeAdvice = {
  localRisk: 0.1,
  localLevel: "cloudy",
  sectors: [],
  avoid: {
    sector: "SO",
    bearingDeg: 225,
    risk: 0.78,
    level: "rain",
    sampleCount: 2,
  },
  escape: {
    sector: "NE",
    bearingDeg: 45,
    risk: 0.12,
    level: "clear",
    sampleCount: 2,
  },
  headline: "Mauvais temps vers le sud-ouest (78 %).",
  detail: "Évitez le sud-ouest. Le ciel reste ouvert vers le nord-est (12 %).",
};

const report: WeatherReport = {
  field: {
    center: { latitude: 45.5, longitude: -72.75 },
    radiusKm: 45,
    samples: [],
    observedAtIso: "2026-08-29T15:00:00.000Z",
  },
  radar: {
    frames: [
      {
        id: "past-latest",
        timeIso: "2026-08-29T15:00:00.000Z",
        kind: "past",
        tileUrlTemplate: "https://tiles.test/latest/{z}/{x}/{y}.png",
      },
      {
        id: "forecast-1",
        timeIso: "2026-08-29T15:20:00.000Z",
        kind: "forecast",
        tileUrlTemplate: "https://tiles.test/next/{z}/{x}/{y}.png",
      },
    ],
    attribution: "Images radar © Test",
    maxZoom: 7,
  },
  advice,
};

function renderControl(props: Partial<Parameters<typeof WeatherMapControl>[0]> = {}) {
  const onToggle = vi.fn();
  const onFrameChange = vi.fn();
  render(
    <WeatherMapControl
      active
      onToggle={onToggle}
      status="ready"
      report={report}
      advice={advice}
      error={null}
      frameId={null}
      onFrameChange={onFrameChange}
      {...props}
    />,
  );
  return { onToggle, onFrameChange };
}

function expandDetails() {
  fireEvent.click(screen.getByRole("button", { name: WEATHER_EXPAND_LABEL }));
}

describe("WeatherMapControl (FR-043)", () => {
  it("offers the layer without turning it on", () => {
    const { onToggle } = renderControl({
      active: false,
      status: "idle",
      report: null,
      advice: null,
    });

    const toggle = screen.getByRole("button", { name: WEATHER_TOGGLE_LABEL });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText(advice.headline)).not.toBeInTheDocument();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("turns the layer on when the rider asks", () => {
    const { onToggle } = renderControl({
      active: false,
      status: "idle",
      report: null,
      advice: null,
    });

    fireEvent.click(
      screen.getByRole("button", { name: WEATHER_TOGGLE_LABEL }),
    );

    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("turns it back off from the pressed state", () => {
    const { onToggle } = renderControl();

    const toggle = screen.getByRole("button", { name: WEATHER_TOGGLE_LABEL });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(toggle);

    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("keeps the useful headline visible without covering the map", () => {
    renderControl();

    expect(screen.getByText(advice.headline)).toBeInTheDocument();
    expect(screen.queryByText(advice.detail)).not.toBeInTheDocument();
    expect(screen.getByText(advice.headline).closest("[data-expanded]")).toHaveAttribute(
      "data-expanded",
      "false",
    );
  });

  it("says it is reading the sky before the first answer", () => {
    renderControl({ status: "loading", report: null, advice: null });

    expect(screen.getByRole("status")).toHaveTextContent(
      WEATHER_LOADING_MESSAGE,
    );
  });

  it("states an outage instead of an empty panel", () => {
    renderControl({
      status: "error",
      report: null,
      advice: null,
      error: "Les données météo ne sont pas disponibles.",
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Les données météo ne sont pas disponibles.",
    );
  });

  it("lets the rider step to the frame that shows where the cell is going", () => {
    const { onFrameChange } = renderControl();
    expandDetails();

    const frames = screen.getByRole("group", { name: "Image radar" });
    expect(frames).toHaveTextContent("Maintenant");
    fireEvent.click(screen.getByRole("button", { name: "+20 min" }));

    expect(onFrameChange).toHaveBeenCalledWith("forecast-1");
  });

  it("marks the frame the map is drawing", () => {
    renderControl({ frameId: "forecast-1" });
    expandDetails();

    expect(screen.getByRole("button", { name: "+20 min" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Maintenant" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("starts folded with everything but the headline away", () => {
    renderControl();

    expect(screen.getByText(advice.headline)).toBeInTheDocument();
    expect(screen.queryByText(advice.detail)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Image radar" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Images radar © Test")).not.toBeInTheDocument();
  });

  it("brings the details back", () => {
    renderControl();

    expandDetails();

    expect(screen.getByText(advice.detail)).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Image radar" }),
    ).toBeInTheDocument();
  });

  it("states whether the details are showing", () => {
    renderControl();

    expect(
      screen.getByRole("button", { name: WEATHER_EXPAND_LABEL }),
    ).toHaveAttribute("aria-expanded", "false");

    expandDetails();

    expect(
      screen.getByRole("button", { name: WEATHER_COLLAPSE_LABEL }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("credits the imagery it shows", () => {
    renderControl();
    expandDetails();

    expect(screen.getByText("Images radar © Test")).toBeInTheDocument();
  });

  it("explains a forecast-only sky when there is no imagery", () => {
    renderControl({
      report: {
        ...report,
        radar: { frames: [], attribution: null, maxZoom: null },
      },
    });
    expandDetails();

    expect(screen.getByText(WEATHER_NO_RADAR_MESSAGE)).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Image radar" }),
    ).not.toBeInTheDocument();
  });
});
