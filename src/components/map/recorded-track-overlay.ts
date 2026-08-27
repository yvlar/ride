import { boundingBox } from "@/domain/geo/bounds";
import type { BoundingBox, Coordinates, LineString } from "@/domain/geo/types";
import {
  recordedPointCoordinates,
  type RecordedTrackPoint,
} from "@/domain/recording/types";

export const RECORDED_TRACK_START_LABEL = "Départ";
export const RECORDED_TRACK_END_LABEL = "Arrivée";

/**
 * FR-041 — vue carte du parcours enregistré. Indépendante du fournisseur
 * cartographique : le moteur de carte consomme cette structure (BR-004).
 */
export type RecordedTrackOverlay = {
  geometry: LineString;
  startPoint: Coordinates | null;
  endPoint: Coordinates | null;
  bounds: BoundingBox | null;
  /** Cadrer la caméra sur tout le parcours (arrêt de l'enregistrement). */
  fitBounds: boolean;
};

export function recordedTrackOverlay(
  points: readonly RecordedTrackPoint[],
  options: { completed?: boolean } = {},
): RecordedTrackOverlay | null {
  if (points.length === 0) {
    return null;
  }
  const completed = options.completed ?? false;
  const geometry: LineString = {
    type: "LineString",
    coordinates: points.map((point) => [point.longitude, point.latitude]),
  };
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return {
    geometry,
    startPoint: recordedPointCoordinates(first),
    // Le marqueur d'arrivée n'apparaît qu'une fois l'enregistrement arrêté :
    // pendant la course, la fin du tracé est la position actuelle.
    endPoint: completed && points.length > 1 ? recordedPointCoordinates(last) : null,
    bounds: boundingBox(geometry),
    fitBounds: completed,
  };
}
