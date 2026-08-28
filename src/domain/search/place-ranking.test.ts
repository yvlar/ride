import { describe, expect, it } from "vitest";
import type { Place } from "@/domain/geo/types";
import { isCanadianPlace, rankPlaces, regionPriority } from "./place-ranking";

function place(overrides: Partial<Place> & { label: string }): Place {
  return {
    coordinates: { latitude: 45, longitude: -72 },
    ...overrides,
  };
}

const granbyQc = place({
  label: "Granby, Québec, Canada",
  name: "Granby",
  region: "Québec",
  country: "Canada",
  coordinates: { latitude: 45.4001, longitude: -72.7342 },
});

const granbyCo = place({
  label: "Granby, Colorado, États-Unis",
  name: "Granby",
  region: "Colorado",
  country: "États-Unis",
  coordinates: { latitude: 40.0866, longitude: -105.9372 },
});

const toronto = place({
  label: "Toronto, Ontario, Canada",
  name: "Toronto",
  region: "Ontario",
  country: "Canada",
  coordinates: { latitude: 43.6532, longitude: -79.3832 },
});

describe("place ranking (FR-032, FR-038)", () => {
  it("puts Québec first, then the rest of Canada, then elsewhere", () => {
    expect(regionPriority(granbyQc)).toBe(2);
    expect(regionPriority(toronto)).toBe(1);
    expect(regionPriority(granbyCo)).toBe(0);

    const ranked = rankPlaces([granbyCo, toronto, granbyQc]);
    expect(ranked.map((item) => item.label)).toEqual([
      "Granby, Québec, Canada",
      "Toronto, Ontario, Canada",
      "Granby, Colorado, États-Unis",
    ]);
  });

  it("never drops a result outside Canada", () => {
    const ranked = rankPlaces([granbyQc, granbyCo]);
    expect(ranked).toHaveLength(2);
    expect(ranked).toContain(granbyCo);
  });

  it("prefers the nearest result inside a tier", () => {
    const magog = place({
      label: "Magog, Québec, Canada",
      region: "Québec",
      country: "Canada",
      coordinates: { latitude: 45.2668, longitude: -72.1478 },
    });
    const percé = place({
      label: "Percé, Québec, Canada",
      region: "Québec",
      country: "Canada",
      coordinates: { latitude: 48.524, longitude: -64.215 },
    });

    const ranked = rankPlaces([percé, magog], {
      proximity: { latitude: 45.4001, longitude: -72.7342 },
    });
    expect(ranked.map((item) => item.label)).toEqual([
      "Magog, Québec, Canada",
      "Percé, Québec, Canada",
    ]);
  });

  it("keeps the provider order when nothing separates two results", () => {
    const first = place({ label: "A", region: "Québec", country: "Canada" });
    const second = place({ label: "B", region: "Québec", country: "Canada" });
    expect(rankPlaces([first, second]).map((item) => item.label)).toEqual([
      "A",
      "B",
    ]);
  });

  it("recognizes Canada from the province when the country is missing", () => {
    expect(isCanadianPlace(place({ label: "X", region: "Ontario" }))).toBe(true);
    expect(isCanadianPlace(place({ label: "X", region: "Vermont" }))).toBe(
      false,
    );
  });
});
