import type { Coordinates } from "@/domain/geo/types";
import type { WeatherSample } from "@/domain/weather/types";

export interface WeatherProvider {
  /**
   * FR-043 — relève la météo courante des points demandés. L'ordre du tableau
   * rendu suit celui des points demandés; un point sans donnée exploitable est
   * simplement absent plutôt que rempli d'une valeur inventée.
   */
  forecast(points: readonly Coordinates[]): Promise<WeatherSample[]>;
}
