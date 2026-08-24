import { RIDE_STYLE_LABELS } from "@/domain/ride/style-catalog";
import type { GenerateRideRequest, RideType } from "@/domain/ride/types";

export const RIDE_TYPE_LABELS: Record<RideType, string> = {
  loop: "Boucle",
  destination: "Destination",
  round_trip: "Aller-retour",
};

export { RIDE_STYLE_LABELS };

export function summarizeRideRequest(request: GenerateRideRequest): string {
  const distance =
    request.targetDistanceKm === undefined
      ? ""
      : ` d’environ ${Math.round(request.targetDistanceKm)} km`;
  const destination =
    request.type === "loop" ? "" : ` vers ${request.destination.label}`;

  const style = request.style ?? "scenic";

  return `Demande prête : ${RIDE_TYPE_LABELS[request.type].toLowerCase()}${distance} au départ de ${request.start.label}${destination}, style ${RIDE_STYLE_LABELS[style].toLowerCase()}.`;
}
