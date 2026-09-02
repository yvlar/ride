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

describe("arcade cloud faces (FR-046)", () => {
  function face(level: WeatherCloudMarker["level"]): HTMLElement {
    return createCloudMarkerElement(marker({ level }), { faces: true });
  }

  it("only puts on a face when the theme asks for one", () => {
    expect(face("rain").classList.contains("ride-map-cloud--arcade")).toBe(true);
    expect(
      createCloudMarkerElement(marker()).classList.contains(
        "ride-map-cloud--arcade",
      ),
    ).toBe(false);
    expect(
      createCloudMarkerElement(marker(), { faces: false }).querySelector(
        ".ride-map-cloud-face",
      ),
    ).toBeNull();
  });

  it("keeps the badge and the accessible name of the plain cloud (NFR-001)", () => {
    const arcade = face("rain");
    const plain = createCloudMarkerElement(marker());

    expect(arcade.getAttribute("role")).toBe(plain.getAttribute("role"));
    expect(arcade.getAttribute("aria-label")).toBe(
      plain.getAttribute("aria-label"),
    );
    expect(arcade.textContent).toBe(plain.textContent);
    expect(arcade.dataset.level).toBe("rain");
    // The mood is a drawing, so assistive technology never sees it.
    expect(arcade.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
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
