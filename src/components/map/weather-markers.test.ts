import { describe, expect, it } from "vitest";
import type { WeatherSample } from "@/domain/weather/types";
import { createWeatherCloudElement } from "./weather-markers";

function sample(precipitationProbability: number): WeatherSample {
  return {
    coordinates: { latitude: 45.4, longitude: -72.73 },
    precipitationProbability,
    precipitationMmPerHour: 0.2,
    temperatureC: 17,
    windKph: 14,
  };
}

describe("nuages météo sur la carte (FR-043)", () => {
  it("assombrit le nuage et ajoute des gouttes avec la probabilité", () => {
    const clear = createWeatherCloudElement(sample(5));
    const possible = createWeatherCloudElement(sample(35));
    const likely = createWeatherCloudElement(sample(65));
    const certain = createWeatherCloudElement(sample(95));

    expect(clear.dataset.rainLevel).toBe("clear");
    expect(possible.dataset.rainLevel).toBe("possible");
    expect(likely.dataset.rainLevel).toBe("likely");
    expect(certain.dataset.rainLevel).toBe("certain");
    expect(clear.querySelectorAll(".ride-map-cloud-drop")).toHaveLength(0);
    expect(possible.querySelectorAll(".ride-map-cloud-drop")).toHaveLength(1);
    expect(likely.querySelectorAll(".ride-map-cloud-drop")).toHaveLength(2);
    expect(certain.querySelectorAll(".ride-map-cloud-drop")).toHaveLength(3);
  });

  it("écrit le pourcentage et un libellé accessible, jamais la couleur seule", () => {
    const element = createWeatherCloudElement(sample(65));

    expect(element).toHaveAttribute("role", "img");
    expect(element).toHaveAttribute("aria-label", "Pluie probable, 65 %");
    expect(
      element.querySelector(".ride-map-cloud-value")?.textContent,
    ).toBe("65 %");
  });

  it("dessine toujours un nuage, même par ciel dégagé", () => {
    const element = createWeatherCloudElement(sample(0));
    const icon = element.querySelector("svg.ride-map-cloud-icon");

    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon?.querySelectorAll("path")).toHaveLength(1);
  });

  it("borne une probabilité aberrante du fournisseur", () => {
    expect(createWeatherCloudElement(sample(140)).dataset.rainLevel).toBe(
      "certain",
    );
    expect(createWeatherCloudElement(sample(-20)).dataset.rainLevel).toBe(
      "clear",
    );
  });
});
