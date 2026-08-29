import { describe, expect, it } from "vitest";
import {
  isWeatherStale,
  weatherFreshnessLabel,
  WEATHER_STALE_AFTER_MS,
} from "./weather-freshness";

const OBSERVED = "2026-08-29T14:00:00.000Z";
const OBSERVED_MS = Date.parse(OBSERVED);

describe("fraîcheur d’un relevé météo (FR-043)", () => {
  it("dit l’âge du relevé en clair", () => {
    expect(weatherFreshnessLabel(OBSERVED, OBSERVED_MS)).toBe("à l’instant");
    expect(weatherFreshnessLabel(OBSERVED, OBSERVED_MS + 5 * 60_000)).toBe(
      "il y a 5 min",
    );
    expect(weatherFreshnessLabel(OBSERVED, OBSERVED_MS + 65 * 60_000)).toBe(
      "il y a 1 h",
    );
    expect(weatherFreshnessLabel(OBSERVED, OBSERVED_MS + 200 * 60_000)).toBe(
      "il y a 3 h",
    );
  });

  it("ne date rien qu’elle ne sait pas dater", () => {
    expect(weatherFreshnessLabel("hier", OBSERVED_MS)).toBeNull();
    // Horloge de l'appareil en avance sur le serveur.
    expect(weatherFreshnessLabel(OBSERVED, OBSERVED_MS - 60_000)).toBeNull();
  });

  it("considère un relevé périmé au-delà d’une demi-heure", () => {
    expect(isWeatherStale(OBSERVED, OBSERVED_MS + 10 * 60_000)).toBe(false);
    expect(
      isWeatherStale(OBSERVED, OBSERVED_MS + WEATHER_STALE_AFTER_MS + 1),
    ).toBe(true);
    expect(isWeatherStale("hier", OBSERVED_MS)).toBe(true);
  });
});
