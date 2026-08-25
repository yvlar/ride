import { describe, expect, it, vi } from "vitest";
import { MAX_GPX_ROUTE_WAYPOINTS, snapGpxWaypoints } from "./snap-gpx-waypoints";
import { MockRoutingProvider } from "@/infrastructure/routing/mock-routing-provider";

const a = { latitude: 45.4, longitude: -72.73 };
const b = { latitude: 45.41, longitude: -72.6 };
const c = { latitude: 45.42, longitude: -72.5 };

describe("snapGpxWaypoints (FR-039, BR-010)", () => {
  it("keeps rtept order when asking the routing provider", async () => {
    const provider = new MockRoutingProvider();
    const spy = vi.spyOn(provider, "calculateRoute");
    const result = await snapGpxWaypoints({ waypoints: [a, b, c] }, provider);
    expect(result.ok).toBe(true);
    expect(spy.mock.calls[0]?.[0].start).toEqual(a);
    expect(spy.mock.calls[0]?.[0].destination).toEqual(c);
    expect(spy.mock.calls[0]?.[0].waypoints).toEqual([b]);
  });

  it("rejects a route with too few points", async () => {
    const result = await snapGpxWaypoints(
      { waypoints: [a] },
      new MockRoutingProvider(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("GPX_INVALID");
  });

  it("rejects an oversized waypoint list", async () => {
    const waypoints = Array.from({ length: MAX_GPX_ROUTE_WAYPOINTS + 1 }, (_, index) => ({
      latitude: 45.4 + index * 0.001,
      longitude: -72.73,
    }));
    const result = await snapGpxWaypoints(
      { waypoints },
      new MockRoutingProvider(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("GPX_INVALID");
  });
});
