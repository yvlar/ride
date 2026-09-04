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

  it("keeps the chance of rain off the map", () => {
    const element = createCloudMarkerElement(marker());

    expect(element.textContent).toBe("");
    expect(element.querySelector(".ride-map-cloud-badge")).toBeNull();
  });

  it("carries the level so the stylesheet can colour it", () => {
    const element = createCloudMarkerElement(marker({ level: "storm" }));

    expect(element.classList.contains("ride-map-cloud--storm")).toBe(true);
    expect(element.dataset.level).toBe("storm");
  });

  it("draws rain streaks only once rain is likely", () => {
    const cloudy = createCloudMarkerElement(marker({ level: "cloudy" }));
    const raining = createCloudMarkerElement(marker({ level: "rain" }));

    expect(cloudy.querySelectorAll(".ride-map-cloud-streak")).toHaveLength(0);
    expect(
      raining.querySelectorAll(".ride-map-cloud-streak").length,
    ).toBeGreaterThan(0);
  });

  it("hides the drawing from assistive technology, the label carries it", () => {
    const element = createCloudMarkerElement(marker());
    const svg = element.querySelector("svg");

    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("cloud faces (FR-043)", () => {
  function face(level: WeatherCloudMarker["level"]): HTMLElement {
    return createCloudMarkerElement(marker({ level }));
  }

  it("carries the mood on the drawing and the level in the text (NFR-001)", () => {
    const element = face("rain");

    expect(element.querySelector(".ride-map-cloud-face")).not.toBeNull();
    // The mood only repeats the level: the accessible name still carries it.
    expect(element.getAttribute("aria-label")).toBe(
      "Pluie, 72 % de risque de pluie",
    );
    expect(element.dataset.level).toBe("rain");
    // The mood is a drawing, so assistive technology never sees it.
    expect(element.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("gives every drawn level a pair of eyes", () => {
    for (const level of ["cloudy", "showers", "rain", "storm"] as const) {
      const element = face(level);

      expect(element.querySelector(".ride-map-cloud-face")).not.toBeNull();
      expect(element.querySelectorAll(".ride-map-cloud-eye")).toHaveLength(2);
      expect(element.querySelectorAll(".ride-map-cloud-pupil")).toHaveLength(2);
      expect(element.querySelector(".ride-map-cloud-body")).not.toBeNull();
    }
  });

  it("wears a different mood for each level", () => {
    const moods = (["cloudy", "showers", "rain", "storm"] as const).map(
      (level) => face(level).querySelector(".ride-map-cloud-face")?.innerHTML,
    );

    expect(new Set(moods).size).toBe(4);
  });

  it("keeps the weather itself on the cloud: streaks, a tear, a bolt", () => {
    expect(
      face("cloudy").querySelectorAll(".ride-map-cloud-streak"),
    ).toHaveLength(0);
    expect(
      face("showers").querySelectorAll(".ride-map-cloud-streak").length,
    ).toBeGreaterThan(0);
    expect(face("rain").querySelector(".ride-map-cloud-tear")).not.toBeNull();
    expect(face("storm").querySelector(".ride-map-cloud-bolt")).not.toBeNull();
    expect(face("rain").querySelector(".ride-map-cloud-bolt")).toBeNull();
  });
});
