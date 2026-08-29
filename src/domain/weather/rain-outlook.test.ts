import { describe, expect, it } from "vitest";
import {
  formatRainProbability,
  isWetLevel,
  rainLevel,
  rainLevelDrops,
  rainLevelLabel,
  rainSampleLabel,
} from "./rain-outlook";

describe("paliers de pluie (FR-043)", () => {
  it("classe la probabilité en quatre paliers lisibles en roulant", () => {
    expect(rainLevel(0)).toBe("clear");
    expect(rainLevel(19)).toBe("clear");
    expect(rainLevel(20)).toBe("possible");
    expect(rainLevel(49)).toBe("possible");
    expect(rainLevel(50)).toBe("likely");
    expect(rainLevel(79)).toBe("likely");
    expect(rainLevel(80)).toBe("certain");
    expect(rainLevel(100)).toBe("certain");
  });

  it("borne les valeurs aberrantes d’un fournisseur", () => {
    expect(rainLevel(-10)).toBe("clear");
    expect(rainLevel(150)).toBe("certain");
    expect(rainLevel(Number.NaN)).toBe("clear");
    // Une valeur non finie n’est pas une donnée : elle ne doit ni annoncer une
    // averse ni faire exploser l’affichage. L’adaptateur la rejette en amont.
    expect(formatRainProbability(Number.POSITIVE_INFINITY)).toBe("0 %");
    expect(formatRainProbability(120)).toBe("100 %");
  });

  it("ne repose jamais sur la couleur seule : chaque palier a un libellé", () => {
    expect(rainLevelLabel(rainLevel(5))).toBe("Ciel dégagé");
    expect(rainSampleLabel(65)).toBe("Pluie probable, 65 %");
    expect(rainSampleLabel(95)).toBe("Pluie, 95 %");
  });

  it("dessine d’autant plus de gouttes que la pluie est probable", () => {
    expect(rainLevelDrops("clear")).toBe(0);
    expect(rainLevelDrops("possible")).toBe(1);
    expect(rainLevelDrops("likely")).toBe(2);
    expect(rainLevelDrops("certain")).toBe(3);
  });

  it("ne signale une direction à éviter qu’à partir de « probable »", () => {
    expect(isWetLevel("clear")).toBe(false);
    expect(isWetLevel("possible")).toBe(false);
    expect(isWetLevel("likely")).toBe(true);
    expect(isWetLevel("certain")).toBe(true);
  });
});
