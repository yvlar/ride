import { describe, expect, it } from "vitest";
import { offsetCoordinates } from "@/domain/geo/distance";
import { DEFAULT_ROUTE_PREFERENCES } from "@/domain/ride/stored-route-preferences";
import { composeGpxRoute, gpxRideRequestFromRoute, orderedRouteWaypoints } from "./compose";
import { parseGpxDocument } from "./parse";

describe("composeGpxRoute (FR-039)", () => {
  it("converts a track into Ride JSON with source gpx", () => {
    const parsed = parseGpxDocument(
      `<?xml version="1.0"?><gpx version="1.1">
        <trk><name>Cantons</name><trkseg>
          <trkpt lat="45.40" lon="-72.73"/>
          <trkpt lat="45.41" lon="-72.72"/>
        </trkseg></trk>
      </gpx>`,
      "cantons.gpx",
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const route = composeGpxRoute({ trip: parsed.trips[0]!, fileName: "cantons.gpx" });
    expect(route.type).toBe("gpx");
    expect(route.source).toBe("gpx");
    expect(route.name).toBe("Cantons");
    expect(route.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
    expect(route.distanceKm).toBeGreaterThan(0);
    expect(route.steps?.length).toBeGreaterThan(0);
  });

  it("preserves rtept order for snapping", () => {
    const a = { latitude: 45.4, longitude: -72.73 };
    const b = offsetCoordinates(a, 90, 1);
    const c = offsetCoordinates(b, 0, 1);
    const parsed = parseGpxDocument(
      `<?xml version="1.0"?><gpx version="1.1">
        <rte><name>Ordre</name>
          <rtept lat="${a.latitude}" lon="${a.longitude}"/>
          <rtept lat="${b.latitude}" lon="${b.longitude}"/>
          <rtept lat="${c.latitude}" lon="${c.longitude}"/>
        </rte>
      </gpx>`,
      "rte.gpx",
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(orderedRouteWaypoints(parsed.trips[0]!)).toEqual([a, b, c]);
  });

  it("copies stored route preferences onto the GPX ride request (FR-007, FR-008, FR-030, FR-039)", () => {
    const parsed = parseGpxDocument(
      `<?xml version="1.0"?><gpx version="1.1">
        <trk><name>Cantons</name><trkseg>
          <trkpt lat="45.40" lon="-72.73"/>
          <trkpt lat="45.41" lon="-72.72"/>
        </trkseg></trk>
      </gpx>`,
      "cantons.gpx",
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const route = composeGpxRoute({ trip: parsed.trips[0]!, fileName: "cantons.gpx" });
    expect(gpxRideRequestFromRoute(route).preferences).toEqual(
      DEFAULT_ROUTE_PREFERENCES,
    );
    expect(
      gpxRideRequestFromRoute(route, {
        avoidHighways: false,
        avoidUnpaved: false,
        stayInCanada: true,
      }).preferences,
    ).toEqual({
      avoidHighways: false,
      avoidUnpaved: false,
      stayInCanada: true,
    });
  });
});
