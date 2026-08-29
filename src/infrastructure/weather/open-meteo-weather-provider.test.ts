import { describe, expect, it, vi } from "vitest";
import { OpenMeteoWeatherProvider } from "./open-meteo-weather-provider";

const GRANBY = { latitude: 45.4001, longitude: -72.7342 };
const SHERBROOKE = { latitude: 45.4022, longitude: -71.8887 };

function jsonFetch(payload: unknown, status = 200) {
  // Le type générique garde `mock.calls` typé : les tests vérifient l'URL
  // construite par l'adaptateur.
  return vi.fn<(input: URL | RequestInfo) => Promise<Response>>(
    async () =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
}

function location(probability: number | null, extra: object = {}) {
  return {
    latitude: 45.5,
    longitude: -72.75,
    current: {
      temperature_2m: 17.4,
      precipitation: 0.6,
      wind_speed_10m: 21,
      ...extra,
    },
    hourly: {
      time: ["2026-08-29T14:00"],
      precipitation_probability: [probability],
    },
  };
}

describe("adaptateur Open-Meteo (FR-043)", () => {
  it("demande la probabilité horaire de l’heure en cours pour tous les points", async () => {
    const fetcher = jsonFetch([location(35), location(80)]);
    const provider = new OpenMeteoWeatherProvider(
      "https://meteo.test/v1",
      fetcher as unknown as typeof fetch,
    );

    await provider.forecast([GRANBY, SHERBROOKE]);

    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(url.pathname).toBe("/v1/forecast");
    expect(url.searchParams.get("latitude")).toBe("45.4001,45.4022");
    expect(url.searchParams.get("longitude")).toBe("-72.7342,-71.8887");
    expect(url.searchParams.get("hourly")).toBe("precipitation_probability");
    expect(url.searchParams.get("forecast_hours")).toBe("1");
    expect(url.searchParams.get("current")).toContain("precipitation");
  });

  it("conserve les coordonnées demandées plutôt que la maille du fournisseur", async () => {
    const fetcher = jsonFetch([location(35)]);
    const provider = new OpenMeteoWeatherProvider(
      "https://meteo.test/v1",
      fetcher as unknown as typeof fetch,
    );

    const [sample] = await provider.forecast([GRANBY]);

    expect(sample?.coordinates).toEqual(GRANBY);
    expect(sample?.precipitationProbability).toBe(35);
    expect(sample?.precipitationMmPerHour).toBe(0.6);
    expect(sample?.temperatureC).toBe(17.4);
    expect(sample?.windKph).toBe(21);
  });

  it("accepte la réponse objet d’une coordonnée unique", async () => {
    const fetcher = jsonFetch(location(10));
    const provider = new OpenMeteoWeatherProvider(
      "https://meteo.test/v1",
      fetcher as unknown as typeof fetch,
    );

    const samples = await provider.forecast([GRANBY]);

    expect(samples).toHaveLength(1);
    expect(samples[0]?.precipitationProbability).toBe(10);
  });

  it("laisse un trou plutôt qu’une valeur inventée quand la probabilité manque", async () => {
    const fetcher = jsonFetch([
      location(null),
      { latitude: 45.5, longitude: -72.7 },
      location(60),
    ]);
    const provider = new OpenMeteoWeatherProvider(
      "https://meteo.test/v1",
      fetcher as unknown as typeof fetch,
    );

    const samples = await provider.forecast([GRANBY, SHERBROOKE, GRANBY]);

    expect(samples).toHaveLength(1);
    expect(samples[0]?.precipitationProbability).toBe(60);
  });

  it("borne une probabilité hors échelle et neutralise les champs non finis", async () => {
    const fetcher = jsonFetch([location(140, { temperature_2m: undefined })]);
    const provider = new OpenMeteoWeatherProvider(
      "https://meteo.test/v1",
      fetcher as unknown as typeof fetch,
    );

    const [sample] = await provider.forecast([GRANBY]);

    expect(sample?.precipitationProbability).toBe(100);
    expect(sample?.temperatureC).toBeNull();
  });

  it("remonte une erreur HTTP et une charge utile illisible", async () => {
    const failing = new OpenMeteoWeatherProvider(
      "https://meteo.test/v1",
      jsonFetch({ error: true }, 503) as unknown as typeof fetch,
    );
    await expect(failing.forecast([GRANBY])).rejects.toThrow("Météo HTTP 503");

    const malformed = new OpenMeteoWeatherProvider(
      "https://meteo.test/v1",
      jsonFetch("pas une prévision") as unknown as typeof fetch,
    );
    await expect(malformed.forecast([GRANBY])).rejects.toThrow(
      "Réponse météo invalide.",
    );
  });

  it("n’appelle pas le réseau sans point à relever", async () => {
    const fetcher = jsonFetch([]);
    const provider = new OpenMeteoWeatherProvider(
      "https://meteo.test/v1",
      fetcher as unknown as typeof fetch,
    );

    expect(await provider.forecast([])).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuse une URL de base non HTTP", () => {
    expect(() => new OpenMeteoWeatherProvider("ftp://meteo.test")).toThrow(
      /HTTP/,
    );
  });
});
