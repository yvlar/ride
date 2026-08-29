import { describe, expect, it } from "vitest";
import { offsetCoordinates } from "@/domain/geo/distance";
import type { Coordinates } from "@/domain/geo/types";
import type { WeatherOverlay, WeatherSample } from "./types";
import {
  COMPASS_SECTORS,
  WEATHER_ADVICE_UNAVAILABLE,
  sectorForBearing,
  weatherDirectionAdvice,
} from "./weather-directions";

const GRANBY: Coordinates = { latitude: 45.4, longitude: -72.73 };

function sample(
  bearingDeg: number,
  distanceKm: number,
  precipitationProbability: number,
): WeatherSample {
  return {
    coordinates: offsetCoordinates(GRANBY, bearingDeg, distanceKm),
    precipitationProbability,
    precipitationMmPerHour: null,
    temperatureC: 18,
    windKph: 12,
  };
}

function overlay(samples: WeatherSample[]): WeatherOverlay {
  return {
    center: GRANBY,
    radiusKm: 60,
    samples,
    observedAt: "2026-08-29T14:00:00.000Z",
  };
}

describe("direction à éviter (FR-043)", () => {
  it("désigne le secteur le plus arrosé et le plus sec", () => {
    const advice = weatherDirectionAdvice(
      overlay([
        sample(225, 60, 90),
        sample(225, 30, 85),
        sample(45, 60, 5),
        sample(45, 30, 10),
      ]),
    );

    expect(advice.worst?.id).toBe("SO");
    expect(advice.best?.id).toBe("NE");
    expect(advice.message).toBe(
      "Pluie vers le sud-ouest (88 %) · Meilleure direction : nord-est (8 %)",
    );
  });

  it("élide l’article des directions est et ouest", () => {
    const advice = weatherDirectionAdvice(
      overlay([sample(90, 60, 95), sample(0, 60, 5)]),
    );

    expect(advice.message).toContain("vers l’est");
  });

  it("moyenne les relevés d’un même secteur et retient le pire", () => {
    const advice = weatherDirectionAdvice(
      overlay([sample(180, 30, 40), sample(180, 60, 80)]),
    );
    const south = advice.sectors.find((sector) => sector.id === "S");

    expect(south?.sampleCount).toBe(2);
    expect(south?.probability).toBe(60);
    expect(south?.peakProbability).toBe(80);
    expect(south?.level).toBe("likely");
  });

  it("écarte une direction dont une seule couronne est orageuse", () => {
    const advice = weatherDirectionAdvice(
      overlay([
        // Moyenne la plus basse, mais un mur de pluie à 60 km.
        sample(0, 30, 0),
        sample(0, 60, 90),
        // Sec de bout en bout : c’est là qu’il faut rouler.
        sample(90, 30, 20),
        sample(90, 60, 25),
      ]),
    );

    expect(advice.best?.id).toBe("E");
    expect(advice.worst?.id).toBe("N");
  });

  it("sépare la météo locale des directions", () => {
    const advice = weatherDirectionAdvice(
      overlay([
        { ...sample(0, 0, 85), coordinates: GRANBY },
        sample(45, 60, 5),
        sample(225, 60, 10),
      ]),
    );

    expect(advice.here?.level).toBe("certain");
    expect(advice.sectors.map((sector) => sector.id)).toEqual(["NE", "SO"]);
  });

  it("liste les secteurs à éviter dès que la pluie est probable", () => {
    const advice = weatherDirectionAdvice(
      overlay([sample(180, 60, 55), sample(0, 60, 85), sample(90, 60, 30)]),
    );

    expect(advice.avoid.map((sector) => sector.id).sort()).toEqual(["N", "S"]);
  });

  it("annonce un ciel dégagé plutôt qu’une direction à éviter", () => {
    const advice = weatherDirectionAdvice(
      overlay([sample(0, 60, 5), sample(180, 60, 10)]),
    );

    expect(advice.avoid).toHaveLength(0);
    expect(advice.message).toBe("Aucune pluie attendue à 60 km à la ronde.");
  });

  it("reste lisible sans donnée", () => {
    const advice = weatherDirectionAdvice(null);

    expect(advice.best).toBeNull();
    expect(advice.worst).toBeNull();
    expect(advice.message).toBe(WEATHER_ADVICE_UNAVAILABLE);
    expect(weatherDirectionAdvice(overlay([])).message).toBe(
      WEATHER_ADVICE_UNAVAILABLE,
    );
  });
});

describe("rose des vents (FR-043)", () => {
  it("arrondit un relèvement au secteur le plus proche", () => {
    expect(sectorForBearing(0).id).toBe("N");
    expect(sectorForBearing(22).id).toBe("N");
    expect(sectorForBearing(23).id).toBe("NE");
    expect(sectorForBearing(350).id).toBe("N");
    expect(sectorForBearing(-90).id).toBe("O");
    expect(sectorForBearing(360).id).toBe("N");
  });

  it("couvre les huit directions avec un libellé prononçable", () => {
    expect(COMPASS_SECTORS).toHaveLength(8);
    for (const sector of COMPASS_SECTORS) {
      expect(sector.label).not.toBe("");
      expect(sector.towardLabel.startsWith("vers l")).toBe(true);
    }
  });
});
