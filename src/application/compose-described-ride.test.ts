import { describe, expect, it, vi } from "vitest";
import { composeDescribedRide } from "./compose-described-ride";
import { parseNaturalLanguageRide } from "@/domain/ride/parse-natural-language";
import type { Place } from "@/domain/geo/types";

const granby: Place = {
  label: "Granby, QC",
  coordinates: { latitude: 45.4001, longitude: -72.7342 },
};

const magog: Place = {
  label: "Magog, QC",
  coordinates: { latitude: 45.2668, longitude: -72.1477 },
};

const gpsPlace: Place = {
  label: "12 Rue Principale, Granby",
  coordinates: { latitude: 45.4, longitude: -72.73 },
};

describe("composeDescribedRide (FR-034)", () => {
  it("resolves a start query and keeps parsed criteria (FR-011, FR-017)", async () => {
    const searchPlaces = vi.fn(async () => [granby]);
    const draft = parseNaturalLanguageRide(
      "Crée une boucle de 250 km au départ de Granby, avec des routes sinueuses, sans autoroute et uniquement asphaltées.",
    );

    const result = await composeDescribedRide({
      draft,
      start: null,
      destination: null,
      fallbackStart: null,
      searchPlaces,
    });

    expect(searchPlaces).toHaveBeenCalledWith("Granby", undefined);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.request).toMatchObject({
      type: "loop",
      start: granby,
      targetDistanceKm: 250,
      style: "curvy",
      preferences: {
        avoidHighways: true,
        avoidUnpaved: true,
        stayInCanada: false,
      },
    });
  });

  it("uses the GPS fallback when no start query is given (FR-017)", async () => {
    const searchPlaces = vi.fn(async () => []);
    const result = await composeDescribedRide({
      draft: parseNaturalLanguageRide("Une boucle de 80 km, routes panoramiques."),
      start: null,
      destination: null,
      fallbackStart: gpsPlace,
      searchPlaces,
    });

    expect(searchPlaces).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.request.start).toEqual(gpsPlace);
    expect(result.request.type).toBe("loop");
    expect(result.request.targetDistanceKm).toBe(80);
  });

  it("prefers an already selected start over search and GPS", async () => {
    const searchPlaces = vi.fn(async () => [granby]);
    const result = await composeDescribedRide({
      draft: parseNaturalLanguageRide("Une boucle de 100 km au départ de Granby."),
      start: magog,
      destination: null,
      fallbackStart: gpsPlace,
      searchPlaces,
    });

    expect(searchPlaces).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.request.start).toEqual(magog);
  });

  it("explains a start query that cannot be resolved (FR-021)", async () => {
    const result = await composeDescribedRide({
      draft: parseNaturalLanguageRide("Une boucle de 80 km au départ de Atlantis."),
      start: null,
      destination: null,
      fallbackStart: null,
      searchPlaces: async () => [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors[0]).toMatchObject({
      field: "start",
      message: expect.stringMatching(/Atlantis/),
    });
  });

  it("resolves a destination query for a point-to-point ride (FR-018)", async () => {
    const searchPlaces = vi.fn(async (query: string) =>
      query.toLowerCase().includes("magog") ? [magog] : [],
    );
    const result = await composeDescribedRide({
      draft: parseNaturalLanguageRide("Un trajet vers Magog, style touring."),
      start: granby,
      destination: null,
      fallbackStart: null,
      searchPlaces,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.request.type).toBe("destination");
    if (result.request.type === "loop") {
      return;
    }
    expect(result.request.destination).toEqual(magog);
    expect(result.request.style).toBe("touring");
  });
});
