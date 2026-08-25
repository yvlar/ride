export const DESCRIBE_DISTANCE_MIN_KM = 20;
export const DESCRIBE_DISTANCE_MAX_KM = 500;
export const DESCRIBE_DISTANCE_STEP_KM = 10;
export const DESCRIBE_DISTANCE_DEFAULT_KM = 100;
export const DESCRIBE_DISTANCE_STORAGE_KEY = "ride.describe.targetDistanceKm";

export const DESCRIBE_DISTANCE_OUT_OF_RANGE_MESSAGE =
  "La distance du trajet doit être comprise entre 20 km et 500 km.";

/**
 * FR-034 — snap a requested loop length onto the describe slider.
 */
export function snapDescribeDistanceKm(value: number): number {
  if (!Number.isFinite(value)) {
    return DESCRIBE_DISTANCE_DEFAULT_KM;
  }
  const clamped = Math.min(
    DESCRIBE_DISTANCE_MAX_KM,
    Math.max(DESCRIBE_DISTANCE_MIN_KM, value),
  );
  const steps = Math.round(
    (clamped - DESCRIBE_DISTANCE_MIN_KM) / DESCRIBE_DISTANCE_STEP_KM,
  );
  return DESCRIBE_DISTANCE_MIN_KM + steps * DESCRIBE_DISTANCE_STEP_KM;
}

export function isDescribeDistanceKm(
  value: number | null | undefined,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= DESCRIBE_DISTANCE_MIN_KM &&
    value <= DESCRIBE_DISTANCE_MAX_KM
  );
}

export function readStoredDescribeDistanceKm(
  storage: Pick<Storage, "getItem"> | null | undefined,
): number {
  if (!storage) {
    return DESCRIBE_DISTANCE_DEFAULT_KM;
  }
  const raw = storage.getItem(DESCRIBE_DISTANCE_STORAGE_KEY);
  if (raw == null || raw.trim() === "") {
    return DESCRIBE_DISTANCE_DEFAULT_KM;
  }
  const parsed = Number(raw);
  return snapDescribeDistanceKm(parsed);
}

export function writeStoredDescribeDistanceKm(
  storage: Pick<Storage, "setItem"> | null | undefined,
  value: number,
): void {
  if (!storage) {
    return;
  }
  storage.setItem(
    DESCRIBE_DISTANCE_STORAGE_KEY,
    String(snapDescribeDistanceKm(value)),
  );
}

export function formatDescribeDistanceLabel(distanceKm: number): string {
  return `${snapDescribeDistanceKm(distanceKm)} km`;
}
