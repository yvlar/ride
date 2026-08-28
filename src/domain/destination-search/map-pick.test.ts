import { describe, expect, it } from "vitest";
import { MAP_POINT_LABEL } from "@/domain/destination/destination";
import type { Place } from "@/domain/geo/types";
import {
  canConfirmMapPick,
  createMapPickState,
  emptyMapPickState,
  reduceMapPick,
} from "./map-pick";

const point = { latitude: 45.4001, longitude: -72.7342 };
const later = { latitude: 46.1185, longitude: -74.5962 };

const granby: Place = {
  label: "125 Rue Principale, Granby, Québec, Canada",
  name: "125 Rue Principale",
  locality: "Granby",
  region: "Québec",
  country: "Canada",
  kind: "address",
  precision: "exact",
  coordinates: point,
};

const tremblant: Place = {
  label: "Mont-Tremblant, Québec, Canada",
  name: "Mont-Tremblant",
  locality: "Mont-Tremblant",
  region: "Québec",
  country: "Canada",
  kind: "city",
  precision: "approximate",
  coordinates: later,
};

describe("map pick reducer (FR-038)", () => {
  it("starts empty and cannot be confirmed", () => {
    const state = emptyMapPickState();
    expect(state.status).toBe("idle");
    expect(canConfirmMapPick(state)).toBe(false);
  });

  it("seeds from an already selected destination", () => {
    const state = createMapPickState(point);
    expect(state.point).toEqual(point);
    expect(canConfirmMapPick(state)).toBe(true);
  });

  it("makes a freshly placed point confirmable before reverse geocoding answers", () => {
    const state = reduceMapPick(emptyMapPickState(), {
      type: "place_point",
      coordinates: point,
      generation: 1,
    });

    expect(state.status).toBe("reverse_geocoding");
    expect(canConfirmMapPick(state)).toBe(true);
    expect(state.place?.label).toContain(MAP_POINT_LABEL);
    expect(state.place?.coordinates).toEqual(point);
  });

  it("adopts the reverse-geocoded address while keeping the picked point", () => {
    let state = reduceMapPick(emptyMapPickState(), {
      type: "place_point",
      coordinates: point,
      generation: 1,
    });
    state = reduceMapPick(state, {
      type: "reverse_success",
      generation: 1,
      place: granby,
    });

    expect(state.status).toBe("ready");
    expect(state.place?.label).toBe(granby.label);
    expect(state.place?.locality).toBe("Granby");
    expect(state.place?.source).toBe("map");
    expect(state.place?.coordinates).toEqual(point);
  });

  it("keeps the coordinates label when reverse geocoding fails", () => {
    let state = reduceMapPick(emptyMapPickState(), {
      type: "place_point",
      coordinates: point,
      generation: 1,
    });
    state = reduceMapPick(state, { type: "reverse_failure", generation: 1 });

    expect(state.status).toBe("reverse_failed");
    // A geocoder outage must never block the selection (FR-038).
    expect(canConfirmMapPick(state)).toBe(true);
    expect(state.place?.label).toBe(
      `${MAP_POINT_LABEL} (45.40010, -72.73420)`,
    );
  });

  it("ignores a reverse-geocoding answer for a marker that has since moved", () => {
    let state = reduceMapPick(emptyMapPickState(), {
      type: "place_point",
      coordinates: point,
      generation: 1,
    });
    state = reduceMapPick(state, {
      type: "place_point",
      coordinates: later,
      generation: 2,
    });

    // The slow answer for the first position arrives last.
    state = reduceMapPick(state, {
      type: "reverse_success",
      generation: 1,
      place: granby,
    });
    expect(state.place?.coordinates).toEqual(later);
    expect(state.place?.label).not.toBe(granby.label);

    state = reduceMapPick(state, {
      type: "reverse_success",
      generation: 2,
      place: tremblant,
    });
    expect(state.place?.label).toBe(tremblant.label);
    expect(state.place?.coordinates).toEqual(later);
  });
});
