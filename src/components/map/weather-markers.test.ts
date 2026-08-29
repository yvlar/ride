import { describe, expect, it } from "vitest";
import { createCloudMarkerElement } from "./weather-markers";
import type { WeatherCloudMarker } from "./weather-overlay";

function marker(
  overrides: Partial<WeatherCloudMarker> = {},
): WeatherCloudMarker {
  return {
    id: "cloud-1",
    coordinates: { latitude: 45.5, longitude: -72.75 },
    level: "rain",
    probability: 72,
    label: "Pluie, 72 % de risque de pluie",
    ...overrides,
  };
}

describe("createCloudMarkerElement (FR-043)", () => {
  it("announces the sky it stands for", () => {
    const element = createCloudMarkerElement(marker());

    expect(element.getAttribute("role")).toBe("img");
    expect(element.getAttribute("aria-label")).toBe(
      "Pluie, 72 % de risque de pluie",
    );
  });

  it("shows the chance of rain next to the cloud", () => {
    const element = createCloudMarkerElement(marker());

    expect(element.textContent).toContain("72 %");
  });

  it("carries the level so the stylesheet can colour it", () => {
    const element = createCloudMarkerElement(marker({ level: "storm" }));

    expect(element.classList.contains("ride-map-cloud--storm")).toBe(true);
    expect(element.dataset.level).toBe("storm");
  });

  it("draws rain streaks only once rain is likely", () => {
    const cloudy = createCloudMarkerElement(marker({ level: "cloudy" }));
    const raining = createCloudMarkerElement(marker({ level: "rain" }));

    expect(cloudy.querySelectorAll("path")).toHaveLength(1);
    expect(raining.querySelectorAll("path").length).toBeGreaterThan(1);
  });

  it("hides the drawing from assistive technology, the label carries it", () => {
    const element = createCloudMarkerElement(marker());
    const svg = element.querySelector("svg");

    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });
});
