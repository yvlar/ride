import { RIDE_STYLE_LABELS } from "@/domain/ride/style-catalog";
import type {
  GenerateRideRequest,
  GeneratedRideRoute,
  RideType,
} from "@/domain/ride/types";

export const RIDE_TYPE_LABELS: Record<RideType, string> = {
  loop: "Boucle",
  destination: "Destination",
  round_trip: "Aller-retour",
};

export function generatedRouteTypeLabel(
  type: GeneratedRideRoute["type"],
): string {
  if (type === "gpx") {
    return "GPX";
  }
  return RIDE_TYPE_LABELS[type];
}

export { RIDE_STYLE_LABELS };

export function summarizeRideRequest(request: GenerateRideRequest): string {
  if (request.type === "gpx") {
    return `Trajet GPX : ${request.name} au départ de ${request.start.label}.`;
  }

  const distance =
    request.targetDistanceKm === undefined
      ? ""
      : ` d’environ ${Math.round(request.targetDistanceKm)} km`;
  const destination =
    request.type === "loop" ? "" : ` vers ${request.destination.label}`;

  const style = request.style ?? "scenic";

  return `Demande prête : ${RIDE_TYPE_LABELS[request.type].toLowerCase()}${distance} au départ de ${request.start.label}${destination}, style ${RIDE_STYLE_LABELS[style].toLowerCase()}.`;
}

export function plannerRideType(
  type: GenerateRideRequest["type"],
): RideType {
  if (type === "gpx") {
    return "destination";
  }
  return type;
}
