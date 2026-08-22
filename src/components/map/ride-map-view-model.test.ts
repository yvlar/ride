import { describe, expect, it } from "vitest";
import type { Place } from "@/domain/geo/types";
import type {
  GeneratedDestinationRoute,
  GeneratedLoopRoute,
  GeneratedRoundTripRoute,
} from "@/domain/ride/types";
import { mapCameraFrame, toRideMapViewModel } from "./ride-map-view-model";

const granby: Place = {
  label: "Granby, QC",
  coordinates: { latitude: 45.4001, longitude: -72.7342 },
};

const tremblant: Place = {
  label: "Mont-Tremblant, QC",
  coordinates: { latitude: 46.1185, longitude: -74.5962 },
};

const loop: GeneratedLoopRoute = {
  id: "loop-1",
  type: "loop",
  start: granby,
  targetDistanceKm: 80,
  style: "curvy",
  geometry: {
    type: "LineString",
    coordinates: [
      [-72.7342, 45.4001],
      [-72.7, 45.45],
      [-72.7342, 45.4001],
    ],
  },
  segments: [],
  distanceKm: 80,
  durationMinutes: 70,
  statistics: { repeatedRoadPercent: 4 },
  warnings: [],
};

const destination: GeneratedDestinationRoute = {
  id: "dest-1",
  type: "destination",
  start: granby,
  destination: tremblant,
  style: "scenic",
  geometry: {
    type: "LineString",
    coordinates: [
      [-72.7342, 45.4001],
      [-74.5962, 46.1185],
    ],
  },
  segments: [],
  distanceKm: 140,
  durationMinutes: 110,
  warnings: [],
};

const roundTrip: GeneratedRoundTripRoute = {
  id: "rt-1",
  type: "round_trip",
  start: granby,
  destination: tremblant,
  style: "touring",
  geometry: {
    type: "LineString",
    coordinates: [
      [-72.7342, 45.4001],
      [-74.5962, 46.1185],
      [-72.7342, 45.4001],
    ],
  },
  segments: [],
  distanceKm: 280,
  durationMinutes: 220,
  statistics: { repeatedRoadPercent: 8, outboundReturnOverlapPercent: 8 },
  warnings: [],
};

describe("toRideMapViewModel (FR-013)", () => {
  it("marks only the start on a loop and describes the loop direction", () => {
    const model = toRideMapViewModel(loop);

    expect(model).not.toBeNull();
    expect(model!.start.label).toBe("Départ");
    expect(model!.start.placeLabel).toBe("Granby, QC");
    expect(model!.destination).toBeUndefined();
    expect(model!.directionLabel).toBe("Sens : boucle depuis Granby, QC");
    expect(model!.directionArrows.length).toBeGreaterThan(0);
  });

  it("includes a destination marker for a point-to-point ride", () => {
    const model = toRideMapViewModel(destination);

    expect(model!.destination).toEqual({
      kind: "destination",
      label: "Destination",
      placeLabel: "Mont-Tremblant, QC",
      coordinates: tremblant.coordinates,
    });
    expect(model!.directionLabel).toBe(
      "Sens : Granby, QC → Mont-Tremblant, QC",
    );
  });

  it("describes the outbound and return direction for a round trip", () => {
    const model = toRideMapViewModel(roundTrip);

    expect(model!.destination?.placeLabel).toBe("Mont-Tremblant, QC");
    expect(model!.directionLabel).toBe(
      "Sens : Granby, QC → Mont-Tremblant, QC → Granby, QC",
    );
  });

  it("frames every geometry vertex", () => {
    const model = toRideMapViewModel(destination);

    expect(model!.bounds.west).toBeLessThanOrEqual(-74.5962);
    expect(model!.bounds.east).toBeGreaterThanOrEqual(-72.7342);
    expect(model!.bounds.south).toBeLessThanOrEqual(45.4001);
    expect(model!.bounds.north).toBeGreaterThanOrEqual(46.1185);
  });

  it("builds an initial camera from the framed bounds", () => {
    const model = toRideMapViewModel(destination);
    const camera = mapCameraFrame(model!.bounds);

    expect(camera.bounds).toEqual([
      [model!.bounds.west, model!.bounds.south],
      [model!.bounds.east, model!.bounds.north],
    ]);
    expect(camera.fitBoundsOptions.duration).toBe(0);
  });

  it("returns null when the route has no drawable geometry", () => {
    expect(
      toRideMapViewModel({
        ...loop,
        geometry: { type: "LineString", coordinates: [] },
      }),
    ).toBeNull();
  });
});
