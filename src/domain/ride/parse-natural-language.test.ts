import { describe, expect, it } from "vitest";
import { parseNaturalLanguageRide } from "./parse-natural-language";

describe("parseNaturalLanguageRide (FR-034)", () => {
  it("extracts a loop request without inventing coordinates", () => {
    const draft = parseNaturalLanguageRide(
      "Crée une boucle de 250 km au départ de Granby, avec des routes sinueuses, sans autoroute et uniquement asphaltées.",
    );

    expect(draft.type).toBe("loop");
    expect(draft.startQuery).toBe("Granby");
    expect(draft.destinationQuery).toBeNull();
    expect(draft.targetDistanceKm).toBe(250);
    expect(draft.style).toBe("curvy");
    expect(draft.preferences).toEqual({
      avoidHighways: true,
      avoidUnpaved: true,
      stayInCanada: false,
    });
    expect(draft.unsupported).toEqual([]);
  });

  it("keeps unsupported styles as warnings instead of new domain values", () => {
    const draft = parseNaturalLanguageRide(
      "Une aventure rapide vers Magog, sans péage.",
    );
    expect(draft.type).toBe("destination");
    expect(draft.destinationQuery).toBe("Magog");
    expect(draft.unsupported.length).toBeGreaterThan(0);
    expect(draft.style).toBe("scenic");
  });

  it("extracts a start place before a trailing period (FR-034)", () => {
    const draft = parseNaturalLanguageRide(
      "Crée une boucle de 80 km au départ de Granby.",
    );
    expect(draft.type).toBe("loop");
    expect(draft.startQuery).toBe("Granby");
    expect(draft.targetDistanceKm).toBe(80);
  });
});
