import { describe, expect, it } from "vitest";
import type { Place } from "@/domain/geo/types";
import type { GenerateRideRequest, GeneratedDestinationRoute } from "@/domain/ride/types";
import {
  canGenerateDestinationSearch,
  canStartDestinationNavigation,
  createDestinationSearchState,
  emptyDestinationSearchState,
  reduceDestinationSearch,
  showsGenerateDestinationAction,
  type DestinationSearchState,
} from "./flow";

const granby: Place = {
  label: "Position actuelle",
  coordinates: { latitude: 45.4001, longitude: -72.7342 },
};

const tremblant: Place = {
  label: "Mont-Tremblant",
  coordinates: { latitude: 46.118, longitude: -74.596 },
};

const request: GenerateRideRequest = {
  type: "destination",
  start: granby,
  destination: tremblant,
  style: "scenic",
  preferences: { avoidHighways: true, avoidUnpaved: true, stayInCanada: false },
};

const route: GeneratedDestinationRoute = {
  id: "route-1",
  type: "destination",
  start: granby,
  destination: tremblant,
  style: "scenic",
  geometry: {
    type: "LineString",
    coordinates: [
      [-72.7342, 45.4001],
      [-74.596, 46.118],
    ],
  },
  segments: [],
  distanceKm: 120,
  durationMinutes: 110,
  warnings: [],
};

const laterRoute: GeneratedDestinationRoute = {
  ...route,
  id: "route-2",
  distanceKm: 124,
};

function located(state: DestinationSearchState): DestinationSearchState {
  return reduceDestinationSearch(state, { type: "locate_success", start: granby });
}

function withDestination(state: DestinationSearchState): DestinationSearchState {
  return reduceDestinationSearch(state, {
    type: "set_destination",
    destination: tremblant,
  });
}

function previewed(state: DestinationSearchState): DestinationSearchState {
  const generating = reduceDestinationSearch(state, { type: "generate_start" });
  return reduceDestinationSearch(generating, {
    type: "generate_success",
    generationId: generating.generationId,
    route,
    request,
  });
}

describe("destination search flow (FR-038)", () => {
  it("starts locating and keeps generate disabled without GPS or destination", () => {
    const state = emptyDestinationSearchState();
    expect(state.phase).toBe("locating");
    expect(canGenerateDestinationSearch(state)).toBe(false);
    const withGps = located(state);
    expect(withGps.phase).toBe("idle");
    expect(canGenerateDestinationSearch(withGps)).toBe(false);
    const ready = withDestination(withGps);
    expect(ready.phase).toBe("destinationReady");
    expect(canGenerateDestinationSearch(ready)).toBe(true);
  });

  it("shows the generate action only once a destination is chosen (FR-038)", () => {
    const withGps = located(emptyDestinationSearchState());
    expect(showsGenerateDestinationAction(withGps)).toBe(false);

    const ready = withDestination(withGps);
    expect(showsGenerateDestinationAction(ready)).toBe(true);

    // A missing GPS fix disables the action, it never removes it.
    const withoutGps = withDestination(emptyDestinationSearchState());
    expect(canGenerateDestinationSearch(withoutGps)).toBe(false);
    expect(showsGenerateDestinationAction(withoutGps)).toBe(true);

    // Editing the text drops the coordinates, so the action goes away with them.
    const retyped = reduceDestinationSearch(ready, {
      type: "change_destination_query",
      query: "Mont-Trembl",
    });
    expect(showsGenerateDestinationAction(retyped)).toBe(false);

    const cleared = reduceDestinationSearch(ready, { type: "clear_destination" });
    expect(showsGenerateDestinationAction(cleared)).toBe(false);
  });

  it("uses the current GPS place as origin once locating succeeds", () => {
    const state = located(withDestination(emptyDestinationSearchState()));
    expect(state.start).toEqual(granby);
    expect(state.destination).toEqual(tremblant);
    expect(state.phase).toBe("destinationReady");
  });

  it("ignores a stale generate_success from an older request (FR-038)", () => {
    const ready = withDestination(located(emptyDestinationSearchState()));
    const first = reduceDestinationSearch(ready, { type: "generate_start" });
    const second = reduceDestinationSearch(first, { type: "generate_start" });
    const stale = reduceDestinationSearch(second, {
      type: "generate_success",
      generationId: first.generationId,
      route,
      request,
    });
    expect(stale.phase).toBe("generating");
    expect(stale.route).toBeNull();
    const fresh = reduceDestinationSearch(stale, {
      type: "generate_success",
      generationId: second.generationId,
      route: laterRoute,
      request,
    });
    expect(fresh.phase).toBe("routePreview");
    expect(fresh.route?.id).toBe("route-2");
  });

  it("previews a generated route before navigation can start", () => {
    const preview = previewed(withDestination(located(emptyDestinationSearchState())));
    expect(preview.phase).toBe("routePreview");
    expect(canStartDestinationNavigation(preview)).toBe(true);
    expect(preview.route).toEqual(route);
    expect(preview.request).toEqual(request);
  });

  it("starts a single navigation from the previewed route", () => {
    const preview = previewed(withDestination(located(emptyDestinationSearchState())));
    const navigating = reduceDestinationSearch(preview, { type: "start_navigation" });
    expect(navigating.phase).toBe("navigating");
    expect(
      reduceDestinationSearch(navigating, { type: "start_navigation" }).phase,
    ).toBe("navigating");
    expect(navigating.generationId).toBeGreaterThan(preview.generationId);
  });

  it("rejects generate_start and start_navigation while already navigating", () => {
    const navigating = reduceDestinationSearch(
      previewed(withDestination(located(emptyDestinationSearchState()))),
      { type: "start_navigation" },
    );
    expect(
      reduceDestinationSearch(navigating, { type: "generate_start" }).phase,
    ).toBe("navigating");
    expect(
      reduceDestinationSearch(navigating, {
        type: "generate_success",
        generationId: navigating.generationId,
        route: laterRoute,
        request,
      }).route?.id,
    ).toBe("route-1");
  });

  it("returns to destination search after cancel without auto-generating", () => {
    const navigating = reduceDestinationSearch(
      previewed(withDestination(located(emptyDestinationSearchState()))),
      { type: "start_navigation" },
    );
    const cancelling = reduceDestinationSearch(navigating, {
      type: "cancel_navigation",
    });
    expect(cancelling.phase).toBe("cancelling");
    const completed = reduceDestinationSearch(cancelling, {
      type: "cancel_completed",
    });
    expect(completed.phase).toBe("locating");
    expect(completed.destination).toEqual(tremblant);
    expect(completed.route).toBeNull();
    expect(completed.request).toBeNull();
    expect(canStartDestinationNavigation(completed)).toBe(false);
    const ready = located(completed);
    expect(ready.phase).toBe("destinationReady");
    expect(canGenerateDestinationSearch(ready)).toBe(true);
  });

  it("keeps an initial destination from recents while locating (FR-035, FR-038)", () => {
    const state = createDestinationSearchState({ destination: tremblant });
    expect(state.destinationQuery).toBe("Mont-Tremblant");
    expect(state.phase).toBe("locating");
    expect(canGenerateDestinationSearch(state)).toBe(false);
  });

  it("keeps preview and generating phases when a locate refresh starts", () => {
    const preview = previewed(withDestination(located(emptyDestinationSearchState())));
    expect(
      reduceDestinationSearch(preview, { type: "locate_start" }).phase,
    ).toBe("routePreview");
    const generating = reduceDestinationSearch(preview, { type: "generate_start" });
    expect(
      reduceDestinationSearch(generating, { type: "locate_start" }).phase,
    ).toBe("generating");
  });

  it("editing the destination invalidates the preview without generating", () => {
    const preview = previewed(withDestination(located(emptyDestinationSearchState())));
    const edited = reduceDestinationSearch(preview, { type: "edit_destination" });
    expect(edited.phase).toBe("destinationReady");
    expect(edited.destination).toEqual(tremblant);
    expect(edited.route).toBeNull();
    expect(canStartDestinationNavigation(edited)).toBe(false);
    expect(canGenerateDestinationSearch(edited)).toBe(true);
  });
});
describe("destination flow — destination validity (FR-038)", () => {
  const start: Place = {
    label: "Granby",
    coordinates: { latitude: 45.4001, longitude: -72.7342 },
  };
  const destination: Place = {
    label: "Mont-Tremblant, Québec, Canada",
    name: "Mont-Tremblant",
    kind: "city",
    precision: "approximate",
    coordinates: { latitude: 46.1185, longitude: -74.5962 },
  };

  function located(): DestinationSearchState {
    return reduceDestinationSearch(emptyDestinationSearchState(), {
      type: "locate_success",
      start,
    });
  }

  function withDestination(): DestinationSearchState {
    return reduceDestinationSearch(located(), {
      type: "set_destination",
      destination,
    });
  }

  it("only enables generation once a destination is confirmed", () => {
    expect(canGenerateDestinationSearch(located())).toBe(false);

    const ready = withDestination();
    expect(ready.stage).toBe("selected");
    expect(canGenerateDestinationSearch(ready)).toBe(true);
  });

  it("refuses a destination whose coordinates are unusable", () => {
    const broken = reduceDestinationSearch(located(), {
      type: "set_destination",
      destination: {
        ...destination,
        coordinates: { latitude: Number.NaN, longitude: -74.5 },
      },
    });

    expect(canGenerateDestinationSearch(broken)).toBe(false);
  });

  it("invalidates the destination as soon as the text diverges", () => {
    const edited = reduceDestinationSearch(withDestination(), {
      type: "change_destination_query",
      query: "Mont-Trembl",
    });

    expect(edited.destination).toBeNull();
    expect(edited.stage).toBe("searching");
    expect(canGenerateDestinationSearch(edited)).toBe(false);
  });

  it("keeps the destination when the text is retyped identically", () => {
    const same = reduceDestinationSearch(withDestination(), {
      type: "change_destination_query",
      query: destination.label,
    });

    expect(same.destination).toEqual(destination);
    expect(canGenerateDestinationSearch(same)).toBe(true);
  });

  it("clears the destination on demand", () => {
    const cleared = reduceDestinationSearch(withDestination(), {
      type: "clear_destination",
    });

    expect(cleared.destination).toBeNull();
    expect(cleared.destinationQuery).toBe("");
    expect(canGenerateDestinationSearch(cleared)).toBe(false);
  });

  it("keeps the destination editable without invalidating it", () => {
    const editing = reduceDestinationSearch(withDestination(), {
      type: "edit_destination_text",
    });

    expect(editing.stage).toBe("searching");
    expect(editing.destination).toEqual(destination);
    expect(canGenerateDestinationSearch(editing)).toBe(true);
  });
});

describe("destination flow — point picked on the map (FR-038)", () => {
  const start: Place = {
    label: "Granby",
    coordinates: { latitude: 45.4001, longitude: -72.7342 },
  };
  const chosen: Place = {
    label: "Mont-Tremblant",
    coordinates: { latitude: 46.1185, longitude: -74.5962 },
  };
  const point = { latitude: 45.9, longitude: -73.1 };
  const pointLabel = "Point sélectionné sur la carte (45.90000, -73.10000)";
  const reversed: Place = {
    label: "125 rue Principale, Granby",
    name: "125 rue Principale",
    locality: "Granby",
    coordinates: point,
  };

  function ready(): DestinationSearchState {
    return reduceDestinationSearch(
      reduceDestinationSearch(emptyDestinationSearchState(), {
        type: "locate_success",
        start,
      }),
      { type: "set_destination", destination: chosen },
    );
  }

  function placed(generation = 1): DestinationSearchState {
    return reduceDestinationSearch(ready(), {
      type: "pick_point",
      coordinates: point,
      generation,
    });
  }

  it("adopts the point as the destination the moment it is placed", () => {
    const state = placed();

    expect(state.destination?.coordinates).toEqual(point);
    expect(state.destination?.source).toBe("map");
    expect(state.destination?.label).toBe(pointLabel);
    expect(state.destinationQuery).toBe(pointLabel);
    expect(state.stage).toBe("selected");
    expect(state.pickStatus).toBe("reverse_geocoding");
    // Coordinates are all routing needs, so the pending lookup blocks nothing.
    expect(canGenerateDestinationSearch(state)).toBe(true);
  });

  it("refines the label once reverse geocoding answers", () => {
    const state = reduceDestinationSearch(placed(), {
      type: "pick_reverse_success",
      generation: 1,
      place: reversed,
    });

    expect(state.destination?.label).toBe(reversed.label);
    expect(state.destination?.coordinates).toEqual(point);
    expect(state.destination?.source).toBe("map");
    expect(state.pickStatus).toBe("ready");
  });

  it("keeps the point when reverse geocoding fails", () => {
    const state = reduceDestinationSearch(placed(), {
      type: "pick_reverse_failure",
      generation: 1,
    });

    expect(state.destination?.coordinates).toEqual(point);
    expect(state.destination?.label).toBe(pointLabel);
    expect(state.pickStatus).toBe("reverse_failed");
    expect(canGenerateDestinationSearch(state)).toBe(true);
  });

  it("ignores a late answer for a point the rider has moved away from", () => {
    const moved = { latitude: 46.2, longitude: -74.1 };
    const state = reduceDestinationSearch(
      reduceDestinationSearch(placed(1), {
        type: "pick_point",
        coordinates: moved,
        generation: 2,
      }),
      { type: "pick_reverse_success", generation: 1, place: reversed },
    );

    expect(state.destination?.coordinates).toEqual(moved);
    expect(state.destination?.label).not.toBe(reversed.label);
    expect(state.pickStatus).toBe("reverse_geocoding");
  });

  it("ignores a late answer once a suggestion has been picked instead", () => {
    const state = reduceDestinationSearch(
      reduceDestinationSearch(placed(), {
        type: "set_destination",
        destination: chosen,
      }),
      { type: "pick_reverse_success", generation: 1, place: reversed },
    );

    expect(state.destination).toEqual(chosen);
    expect(state.pickStatus).toBe("idle");
  });

  it("drops a stale preview when the map pick moves the destination", () => {
    const previewed: DestinationSearchState = {
      ...ready(),
      phase: "routePreview",
      route: { id: "route-1" } as unknown as DestinationSearchState["route"],
      request: {} as unknown as DestinationSearchState["request"],
    };

    const state = reduceDestinationSearch(previewed, {
      type: "pick_point",
      coordinates: point,
      generation: 1,
    });

    expect(state.route).toBeNull();
    expect(state.request).toBeNull();
  });

  it("keeps the preview when only the label of the same point changes", () => {
    const previewed: DestinationSearchState = {
      ...placed(),
      phase: "routePreview",
      route: { id: "route-1" } as unknown as DestinationSearchState["route"],
      request: {} as unknown as DestinationSearchState["request"],
    };

    const state = reduceDestinationSearch(previewed, {
      type: "pick_reverse_success",
      generation: 1,
      place: reversed,
    });

    expect(state.route).not.toBeNull();
    expect(state.request).not.toBeNull();
  });

  it("refuses to move the destination during navigation", () => {
    const navigating: DestinationSearchState = {
      ...ready(),
      phase: "navigating",
    };

    const state = reduceDestinationSearch(navigating, {
      type: "pick_point",
      coordinates: point,
      generation: 1,
    });

    expect(state).toBe(navigating);
  });
});
