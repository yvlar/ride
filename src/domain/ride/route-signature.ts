import type { LineString } from "@/domain/geo/types";

/**
 * FR-034 / FR-012 — compact identity of a previous corridor so the AI can
 * avoid proposing essentially the same loop. Not shown to the user.
 */
export function previousRideSignature(input: {
  id?: string;
  geometry: LineString;
}): string {
  const coords = input.geometry.coordinates
    .map(([longitude, latitude]) => `${longitude.toFixed(5)},${latitude.toFixed(5)}`)
    .join(";");
  const hash = djb2(coords);
  return `${input.id ?? "route"}:${input.geometry.coordinates.length}:${hash.toString(16)}`;
}

function djb2(value: string): number {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
    hash >>>= 0;
  }
  return hash;
}
