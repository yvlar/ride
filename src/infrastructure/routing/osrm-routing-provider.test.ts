import { describe, expect, it, vi } from "vitest";
import type { Coordinates } from "@/domain/geo/types";
import { createRoutingProvider } from "./create-routing-provider";
import {
  OSRM_REQUEST_TIMEOUT_MS,
  OsrmRoutingProvider,
} from "./osrm-routing-provider";
import { RoutingKnowledgeError } from "./routing-knowledge-error";

const GRANBY: Coordinates = { latitude: 45.403, longitude: -72.734 };
const WATERLOO: Coordinates = { latitude: 45.35, longitude: -72.516 };

const SUCCESS_RESPONSE = {
  code: "Ok",
  routes: [
    {
      distance: 15_100,
      duration: 1_210,
      geometry: {
        type: "LineString",
        coordinates: [
          [-72.734, 45.403],
          [-72.67, 45.43],
          [-72.6, 45.39],
          [-72.516, 45.35],
        ],
      },
      legs: [
        {
          steps: [
            {
              distance: 7_500,
              duration: 600,
              name: "Route 112",
              ref: "112",
              geometry: {
                type: "LineString",
                coordinates: [
                  [-72.734, 45.403],
                  [-72.67, 45.43],
                ],
              },
            },
          ],
        },
        {
          steps: [
            {
              distance: 7_600,
              duration: 610,
              name: "Chemin de campagne",
              geometry: {
                type: "LineString",
                coordinates: [
                  [-72.67, 45.43],
                  [-72.6, 45.39],
                  [-72.516, 45.35],
                ],
              },
            },
          ],
        },
      ],
    },
  ],
} as const;

describe("OsrmRoutingProvider", () => {
  it("routes every stop on the real-road OSRM endpoint", async () => {
    const fetcher = mockFetch(SUCCESS_RESPONSE);
    const provider = new OsrmRoutingProvider(
      "https://routing.example.test/osrm",
      fetcher,
    );

    const result = await provider.calculateRoute({
      start: GRANBY,
      waypoints: [{ latitude: 45.43, longitude: -72.67 }],
      destination: WATERLOO,
    });

    const requestUrl = fetcher.mock.calls[0]?.[0];
    expect(requestUrl).toBeInstanceOf(URL);
    const url = new URL(String(requestUrl));
    expect(url.pathname).toBe(
      "/osrm/route/v1/driving/-72.734000,45.403000;-72.670000,45.430000;-72.516000,45.350000",
    );
    expect(url.searchParams.get("steps")).toBe("true");
    expect(url.searchParams.get("geometries")).toBe("geojson");
    expect(url.searchParams.get("overview")).toBe("full");
    const requestHeaders = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(requestHeaders.get("user-agent")).toBe(
      "Ride/1.0 (+https://github.com/yvlar/ride)",
    );

    expect(result.geometry.coordinates).toHaveLength(4);
    expect(result.distanceKm).toBe(15.1);
    expect(result.durationMinutes).toBeCloseTo(20.17, 2);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toMatchObject({
      roadName: "112 — Route 112",
      surface: "unknown",
      distanceKm: 7.5,
      durationMinutes: 10,
    });
  });

  it("keeps OSRM maneuvers as provider-agnostic navigation steps (FR-024)", async () => {
    const fetcher = mockFetch({
      ...SUCCESS_RESPONSE,
      routes: [
        {
          ...SUCCESS_RESPONSE.routes[0],
          legs: [
            {
              steps: [
                {
                  ...SUCCESS_RESPONSE.routes[0].legs[0]!.steps[0],
                  destinations: "Waterloo",
                  rotary_name: "Giratoire Nord",
                  driving_side: "right",
                  maneuver: {
                    type: "roundabout",
                    modifier: "right",
                    location: [-72.734, 45.403],
                    bearing_before: 12,
                    bearing_after: 98,
                    exit: 2,
                  },
                },
              ],
            },
            {
              steps: [
                {
                  ...SUCCESS_RESPONSE.routes[0].legs[1]!.steps[0],
                  maneuver: {
                    type: "quantum-leap",
                    modifier: "sideways",
                    location: [-72.516, 45.35],
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    const provider = new OsrmRoutingProvider(
      "https://routing.example.test",
      fetcher,
    );

    const result = await provider.calculateRoute({
      start: GRANBY,
      destination: WATERLOO,
    });

    expect(result.steps?.[0]).toMatchObject({
      maneuverType: "roundabout",
      modifier: "right",
      exit: 2,
      destinations: "Waterloo",
      rotaryName: "Giratoire Nord",
    });
    expect(result.steps?.[1]?.maneuverType).toBe("unknown");
  });

  it("asks OSRM to exclude motorways when requested (FR-007)", async () => {
    const fetcher = mockFetch(SUCCESS_RESPONSE);
    const provider = new OsrmRoutingProvider(
      "https://routing.example.test",
      fetcher,
    );

    await provider.calculateRoute({
      start: GRANBY,
      destination: WATERLOO,
      preferences: { avoidHighways: true, avoidUnpaved: false },
    });

    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.searchParams.get("exclude")).toBe("motorway");
  });

  it("routes without the unsupported exclude flag on the public OSRM demo", async () => {
    const fetcher = mockFetch(SUCCESS_RESPONSE);
    const provider = new OsrmRoutingProvider(
      "https://router.project-osrm.org",
      fetcher,
    );

    await provider.calculateRoute({
      start: GRANBY,
      destination: WATERLOO,
      preferences: { avoidHighways: true, avoidUnpaved: false },
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.searchParams.has("exclude")).toBe(false);
  });

  it("remembers profiles that do not support motorway exclusions", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            code: "InvalidValue",
            message: "Exclude flag combination is not supported.",
          },
          400,
        ),
      )
      .mockImplementation(async () => jsonResponse(SUCCESS_RESPONSE));
    const provider = new OsrmRoutingProvider(
      "https://routing.example.test",
      fetcher,
    );

    await provider.calculateRoute({
      start: GRANBY,
      destination: WATERLOO,
      preferences: { avoidHighways: true, avoidUnpaved: false },
    });
    await provider.calculateRoute({
      start: GRANBY,
      destination: WATERLOO,
      preferences: { avoidHighways: true, avoidUnpaved: false },
    });

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(
      fetcher.mock.calls.map(([url]) =>
        new URL(String(url)).searchParams.get("exclude"),
      ),
    ).toEqual(["motorway", null, null]);
  });

  it("keeps concurrent candidates independent when one request fails", async () => {
    const fetcher = vi.fn<typeof fetch>(async (request) => {
      const url = new URL(String(request));
      return url.pathname.includes("/driving/-72.734000,45.403000;")
        ? jsonResponse({ code: "Error" }, 503)
        : jsonResponse(SUCCESS_RESPONSE);
    });
    const provider = new OsrmRoutingProvider(
      "https://routing.example.test",
      fetcher,
    );

    const results = await Promise.allSettled([
      provider.calculateRoute({
        start: GRANBY,
        destination: WATERLOO,
        preferences: { avoidHighways: true, avoidUnpaved: false },
      }),
      provider.calculateRoute({
        start: WATERLOO,
        destination: GRANBY,
        preferences: { avoidHighways: true, avoidUnpaved: false },
      }),
    ]);

    expect(results.map((result) => result.status)).toEqual([
      "rejected",
      "fulfilled",
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(
      fetcher.mock.calls.map(([url]) =>
        new URL(String(url)).searchParams.get("exclude"),
      ),
    ).toEqual(["motorway", "motorway"]);
  });

  it("retries without exclusion when a supported profile finds no route", async () => {
    const motorwayResponse = responseWithRoadNames([
      "Highway 401",
      "Highway 401 Express",
    ]);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ code: "NoRoute", message: "No route found" }, 400),
      )
      .mockImplementation(async () => jsonResponse(motorwayResponse));
    const provider = new OsrmRoutingProvider(
      "https://routing.example.test",
      fetcher,
    );

    const result = await provider.calculateRoute({
      start: GRANBY,
      destination: WATERLOO,
      preferences: { avoidHighways: true, avoidUnpaved: false },
    });

    expect(
      fetcher.mock.calls.map(([url]) =>
        new URL(String(url)).searchParams.get("exclude"),
      ),
    ).toEqual(["motorway", null]);
    expect(result.segments.every((segment) => segment.roadClass === "motorway"))
      .toBe(true);
  });

  it("maps OSRM motorway classes and public-demo road names (FR-007)", async () => {
    const route = SUCCESS_RESPONSE.routes[0];
    const firstLeg = route.legs[0];
    const firstStep = firstLeg.steps[0];
    const fetcher = mockFetch({
      ...SUCCESS_RESPONSE,
      routes: [
        {
          ...route,
          legs: [
            {
              ...firstLeg,
              steps: [
                {
                  ...firstStep,
                  name: "Autoroute des Cantons-de-l'Est",
                },
              ],
            },
            {
              ...route.legs[1],
              steps: [
                {
                  ...route.legs[1].steps[0],
                  intersections: [{ classes: ["motorway_link"] }],
                },
              ],
            },
          ],
        },
      ],
    });
    const provider = new OsrmRoutingProvider(
      "https://router.project-osrm.org",
      fetcher,
    );

    const result = await provider.calculateRoute({
      start: GRANBY,
      destination: WATERLOO,
    });

    expect(result.segments.map((segment) => segment.roadClass)).toEqual([
      "motorway",
      "motorway_link",
    ]);
  });

  it("recognizes explicit Canadian and US controlled-access road names", async () => {
    const fetcher = mockFetch(
      responseWithRoadNames(
        [
          "Highway 401",
          "Highway 401 Express",
          "Queen Elizabeth Way",
          "Interstate 90",
          "Highway 7",
          "",
          "",
        ],
        [
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          "ON 401",
          "I-90",
        ],
      ),
    );
    const provider = new OsrmRoutingProvider(
      "https://router.project-osrm.org",
      fetcher,
    );

    const result = await provider.calculateRoute({
      start: GRANBY,
      destination: WATERLOO,
    });

    expect(result.segments.map((segment) => segment.roadClass)).toEqual([
      "motorway",
      "motorway",
      "motorway",
      "motorway",
      undefined,
      "motorway",
      "motorway",
    ]);
  });

  it("maps an OSRM no-route response to the provider-agnostic failure", async () => {
    const fetcher = mockFetch(
      { code: "NoRoute", message: "No route found" },
      400,
    );
    const provider = new OsrmRoutingProvider(
      "https://routing.example.test",
      fetcher,
    );

    await expect(
      provider.calculateRoute({ start: GRANBY, destination: WATERLOO }),
    ).rejects.toBeInstanceOf(RoutingKnowledgeError);
  });

  it("rejects malformed success payloads instead of inventing geometry", async () => {
    const fetcher = mockFetch({ code: "Ok", routes: [] });
    const provider = new OsrmRoutingProvider(
      "https://routing.example.test",
      fetcher,
    );

    await expect(
      provider.calculateRoute({ start: GRANBY, destination: WATERLOO }),
    ).rejects.toThrow("Réponse OSRM incomplète");
  });

  it("rejects an out-of-range longitude inside the route geometry", async () => {
    const route = SUCCESS_RESPONSE.routes[0];
    const fetcher = mockFetch({
      ...SUCCESS_RESPONSE,
      routes: [
        {
          ...route,
          geometry: {
            ...route.geometry,
            coordinates: [
              [-72.734, 45.403],
              [181, 45.43],
              [-72.516, 45.35],
            ],
          },
        },
      ],
    });
    const provider = new OsrmRoutingProvider(
      "https://routing.example.test",
      fetcher,
    );

    await expect(
      provider.calculateRoute({ start: GRANBY, destination: WATERLOO }),
    ).rejects.toThrow("Réponse OSRM incomplète");
  });

  it("rejects an out-of-range latitude inside a step geometry", async () => {
    const route = SUCCESS_RESPONSE.routes[0];
    const firstLeg = route.legs[0];
    const firstStep = firstLeg.steps[0];
    const fetcher = mockFetch({
      ...SUCCESS_RESPONSE,
      routes: [
        {
          ...route,
          legs: [
            {
              ...firstLeg,
              steps: [
                {
                  ...firstStep,
                  geometry: {
                    ...firstStep.geometry,
                    coordinates: [
                      [-72.734, 45.403],
                      [-72.67, 91],
                    ],
                  },
                },
              ],
            },
            route.legs[1],
          ],
        },
      ],
    });
    const provider = new OsrmRoutingProvider(
      "https://routing.example.test",
      fetcher,
    );

    await expect(
      provider.calculateRoute({ start: GRANBY, destination: WATERLOO }),
    ).rejects.toThrow("Réponse OSRM incomplète");
  });

  it("keeps the provider timeout below the 10-second route budget", () => {
    expect(OSRM_REQUEST_TIMEOUT_MS).toBeLessThan(10_000);
  });

  it("aborts a stalled provider request at the configured timeout", async () => {
    const fetcher = vi.fn<typeof fetch>((_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!(signal instanceof AbortSignal)) {
          reject(new Error("Signal d’abandon manquant."));
          return;
        }
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      }),
    );
    const provider = new OsrmRoutingProvider(
      "https://routing.example.test",
      fetcher,
      "driving",
      5,
    );

    await expect(
      provider.calculateRoute({ start: GRANBY, destination: WATERLOO }),
    ).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("requires HTTP(S) for the configured routing endpoint", () => {
    expect(
      () => new OsrmRoutingProvider("file:///tmp/osrm"),
    ).toThrow("HTTP ou HTTPS");
  });
});

describe("createRoutingProvider with OSRM", () => {
  it("creates the real-road adapter when its endpoint is configured", () => {
    const provider = createRoutingProvider({
      ROUTING_PROVIDER: "osrm",
      ROUTING_API_BASE_URL: "https://routing.example.test",
    });

    expect(provider).toBeInstanceOf(OsrmRoutingProvider);
  });

  it("fails fast when OSRM has no endpoint", () => {
    expect(() =>
      createRoutingProvider({ ROUTING_PROVIDER: "osrm" }),
    ).toThrow("ROUTING_API_BASE_URL");
  });
});

function mockFetch(payload: unknown, status = 200) {
  return vi.fn<typeof fetch>(async () => jsonResponse(payload, status));
}

function responseWithRoadNames(
  names: string[],
  references: (string | undefined)[] = [],
) {
  const route = SUCCESS_RESPONSE.routes[0];
  const step = route.legs[0].steps[0];
  return {
    ...SUCCESS_RESPONSE,
    routes: [
      {
        ...route,
        legs: [
          {
            steps: names.map((name, index) => ({
              ...step,
              name,
              ref: references[index],
            })),
          },
        ],
      },
    ],
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
