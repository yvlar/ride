import { describe, expect, it } from "vitest";
import type { Place } from "@/domain/geo/types";
import {
  classifySearchFailure,
  emptyPlaceSearchState,
  isStaleSearchGeneration,
  reducePlaceSearch,
} from "./place-search";

const granby: Place = {
  label: "Granby, QC",
  coordinates: { latitude: 45.4, longitude: -72.73 },
};

describe("place search reducer (FR-032)", () => {
  it("starts empty and ignores queries that are too short", () => {
    const empty = emptyPlaceSearchState();
    expect(empty.status).toBe("empty");
    const typing = reducePlaceSearch(empty, { type: "query", query: "G" });
    expect(typing.status).toBe("typing");
    expect(typing.places).toEqual([]);
  });

  it("does not apply a stale success after a newer generation", () => {
    let state = emptyPlaceSearchState();
    state = reducePlaceSearch(state, { type: "query", query: "Gran" });
    state = reducePlaceSearch(state, {
      type: "begin",
      query: "Gran",
      generation: 1,
    });
    state = reducePlaceSearch(state, {
      type: "success",
      generation: 1,
      query: "Gran",
      places: [granby],
    });
    expect(state.status).toBe("results");

    state = reducePlaceSearch(state, {
      type: "begin",
      query: "Gran",
      generation: 2,
    });
    state = reducePlaceSearch(state, {
      type: "success",
      generation: 1,
      query: "Gran",
      places: [granby],
    });
    expect(state.status).toBe("loading");
    expect(state.places).toEqual([]);

    state = reducePlaceSearch(state, {
      type: "success",
      generation: 2,
      query: "Gran",
      places: [granby],
    });
    expect(state.status).toBe("results");
    expect(state.places).toEqual([granby]);
  });

  it("cancels in-flight results so they cannot replace a newer query", () => {
    let state = emptyPlaceSearchState();
    state = { ...state, generation: 4, query: "Magog", status: "loading" };
    state = reducePlaceSearch(state, { type: "cancel" });
    expect(state.status).toBe("cancelled");
    state = reducePlaceSearch(state, {
      type: "success",
      generation: 4,
      query: "Magog",
      places: [granby],
    });
    expect(state.status).toBe("cancelled");
    expect(state.places).toEqual([]);
  });

  it("marks a selected place and treats a matching query as selected", () => {
    let state = reducePlaceSearch(emptyPlaceSearchState(), {
      type: "select",
      place: granby,
    });
    expect(state.status).toBe("selected");
    expect(state.selected).toEqual(granby);
    state = reducePlaceSearch(state, { type: "query", query: "Granby, QC" });
    expect(state.status).toBe("selected");
  });

  it("classifies network failures and ignores aborted generations", () => {
    expect(classifySearchFailure(new TypeError("Failed to fetch"))).toBe(
      "offline",
    );
    expect(isStaleSearchGeneration(3, 2)).toBe(true);
    expect(isStaleSearchGeneration(3, 3)).toBe(false);
  });
});
