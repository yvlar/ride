export function formatDistanceLabel(distanceKm: number): string {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    return "—";
  }
  if (distanceKm < 1) {
    return `${Math.max(0, Math.round(distanceKm * 1_000))} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}

export function formatDurationLabel(durationMinutes: number): string {
  const minutes = Math.max(0, Math.round(durationMinutes));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function formatEta(nowMs: number, remainingMinutes: number): string {
  const arrival = new Date(nowMs + remainingMinutes * 60_000);
  return new Intl.DateTimeFormat("fr-CA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(arrival);
}

export function formatAccuracyLabel(accuracyMeters: number | null): string {
  if (accuracyMeters === null) {
    return "GPS en attente";
  }
  if (accuracyMeters > 80) {
    return `Précision faible (±${Math.round(accuracyMeters)} m)`;
  }
  return `±${Math.round(accuracyMeters)} m`;
}
