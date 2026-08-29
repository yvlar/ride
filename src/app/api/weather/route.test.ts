import { afterEach, describe, expect, it, vi } from "vitest";
import { haversineKm } from "@/domain/geo/distance";

const forecast = vi.fn();

vi.mock("@/infrastructure/weather/get-weather-provider", () => ({
  getWeatherProvider: () => ({ forecast }),
}));

function sample(latitude: number, longitude: number, probability: number) {
  return {
    coordinates: { latitude, longitude },
    precipitationProbability: probability,
    precipitationMmPerHour: 0,
    temperatureC: 18,
    windKph: 10,
  };
}

describe("GET /api/weather (FR-043)", () => {
  afterEach(() => {
    forecast.mockReset();
  });

  it("relève la grille autour du point demandé et rend la nappe", async () => {
    forecast.mockResolvedValue([sample(45.4, -72.73, 30)]);
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "http://localhost/api/weather?latitude=45.4&longitude=-72.73&radiusKm=60",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toMatch(/no-store/i);
    const points = forecast.mock.calls[0]![0] as {
      latitude: number;
      longitude: number;
    }[];
    expect(points).toHaveLength(17);
    expect(points[0]).toEqual({ latitude: 45.4, longitude: -72.73 });
    expect(
      Math.round(haversineKm(points[0]!, points[points.length - 1]!)),
    ).toBe(60);
    expect(body.data.overlay.center).toEqual({
      latitude: 45.4,
      longitude: -72.73,
    });
    expect(body.data.overlay.radiusKm).toBe(60);
    expect(body.data.overlay.samples).toHaveLength(1);
    expect(Date.parse(body.data.overlay.observedAt)).not.toBeNaN();
  });

  it("borne un rayon démesuré au lieu de le refuser", async () => {
    forecast.mockResolvedValue([sample(45.4, -72.73, 10)]);
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "http://localhost/api/weather?latitude=45.4&longitude=-72.73&radiusKm=5000",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.overlay.radiusKm).toBe(200);
  });

  it("refuse des coordonnées ou un rayon invalides", async () => {
    const { GET } = await import("./route");
    const cases = [
      "http://localhost/api/weather?longitude=-72.7",
      "http://localhost/api/weather?latitude=abc&longitude=-72.7",
      "http://localhost/api/weather?latitude=91&longitude=-72.7",
      "http://localhost/api/weather?latitude=45.4&longitude=200",
      "http://localhost/api/weather?latitude=45.4&longitude=-72.7&radiusKm=-3",
      "http://localhost/api/weather?latitude=45.4&longitude=-72.7&radiusKm=zero",
    ];

    for (const href of cases) {
      const response = await GET(new Request(href));
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    }
    expect(forecast).not.toHaveBeenCalled();
  });

  it("signale une panne du fournisseur plutôt qu’une nappe vide", async () => {
    forecast.mockRejectedValue(new Error("Météo HTTP 503"));
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/weather?latitude=45.4&longitude=-72.73"),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("PROVIDER_ERROR");
  });

  it("traite un relevé entièrement vide comme une panne", async () => {
    forecast.mockResolvedValue([]);
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/weather?latitude=45.4&longitude=-72.73"),
    );

    expect(response.status).toBe(503);
  });
});
