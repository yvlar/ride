import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WeatherSample } from "@/domain/weather/types";
import type {
  RadarProvider,
  WeatherProvider,
} from "@/infrastructure/weather/weather-provider";

const providers = vi.hoisted(() => ({
  weather: null as WeatherProvider | null,
  radar: null as RadarProvider | null,
}));

vi.mock("@/infrastructure/weather/get-weather-provider", () => ({
  getWeatherProvider: () => {
    if (!providers.weather) {
      throw new Error("WEATHER_PROVIDER absent");
    }
    return providers.weather;
  },
  getRadarProvider: () => providers.radar ?? undefined,
}));

/** A dry sky everywhere except due south, 45 km out. */
function southernRain(): WeatherProvider {
  return {
    sample: async (points) =>
      points.map<WeatherSample>((coordinates, index) => {
        const southern = index === 13;
        return {
          coordinates,
          precipitationProbability: southern ? 90 : 5,
          precipitationMmPerHour: southern ? 4 : 0,
          cloudCover: southern ? 95 : 10,
          thunder: false,
          temperatureC: 19,
          windSpeedKmh: 12,
        };
      }),
  };
}

async function get(url: string): Promise<Response> {
  const { GET } = await import("./route");
  return GET(new Request(url));
}

beforeEach(() => {
  providers.weather = southernRain();
  providers.radar = {
    frames: async () => ({
      frames: [
        {
          id: "past-1",
          timeIso: "2026-08-29T15:00:00.000Z",
          kind: "past",
          tileUrlTemplate: "https://tiles.test/{z}/{x}/{y}.png",
        },
      ],
      attribution: "Images radar © Test",
    }),
  };
});

describe("GET /api/weather (FR-043)", () => {
  it("returns the sampled field, the imagery and the advice", async () => {
    const response = await get(
      "http://localhost/api/weather?latitude=45.5&longitude=-72.75",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.data.field.samples).toHaveLength(17);
    expect(body.data.field.center).toEqual({
      latitude: 45.5,
      longitude: -72.75,
    });
    expect(body.data.radar.frames).toHaveLength(1);
    expect(body.meta.requestId).toEqual(expect.any(String));
  });

  it("names the direction to avoid and the one to take", async () => {
    const response = await get(
      "http://localhost/api/weather?latitude=45.5&longitude=-72.75",
    );
    const body = await response.json();

    expect(body.data.advice.avoid.sector).toBe("S");
    expect(body.data.advice.escape.sector).toBe("N");
    expect(body.data.advice.headline).toContain("sud");
    expect(body.data.advice.detail).toContain("nord");
  });

  it("honours a narrower radius", async () => {
    const response = await get(
      "http://localhost/api/weather?latitude=45.5&longitude=-72.75&radiusKm=20",
    );
    const body = await response.json();

    expect(body.data.field.radiusKm).toBe(20);
  });

  it("clamps an out-of-range radius instead of failing", async () => {
    const response = await get(
      "http://localhost/api/weather?latitude=45.5&longitude=-72.75&radiusKm=9999",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.field.radiusKm).toBe(200);
  });

  it("rejects missing or invalid coordinates", async () => {
    const missing = await get("http://localhost/api/weather");
    const invalid = await get(
      "http://localhost/api/weather?latitude=91&longitude=-72.75",
    );

    expect(missing.status).toBe(400);
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe("INVALID_COORDINATES");
  });

  it("still answers when the radar imagery is down", async () => {
    providers.radar = {
      frames: async () => {
        throw new Error("Radar HTTP 503");
      },
    };
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await get(
      "http://localhost/api/weather?latitude=45.5&longitude=-72.75",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.radar.frames).toEqual([]);
    expect(body.data.field.samples).toHaveLength(17);
    errors.mockRestore();
  });

  it("reports a forecast outage as a service failure", async () => {
    providers.weather = {
      sample: async () => {
        throw new Error("Météo HTTP 503");
      },
    };

    const response = await get(
      "http://localhost/api/weather?latitude=45.5&longitude=-72.75",
    );

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("PROVIDER_ERROR");
  });
});
