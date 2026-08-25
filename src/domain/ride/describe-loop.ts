export const DESCRIBE_LOOP_STORAGE_KEY = "ride.describe.returnToStart";
export const DESCRIBE_LOOP_DEFAULT = true;

/**
 * FR-034 — whether Décrire mon trajet closes the ride back at the origin.
 */
export function readStoredDescribeLoop(
  storage: Pick<Storage, "getItem"> | null | undefined,
): boolean {
  if (!storage) {
    return DESCRIBE_LOOP_DEFAULT;
  }
  const raw = storage.getItem(DESCRIBE_LOOP_STORAGE_KEY);
  if (raw == null || raw.trim() === "") {
    return DESCRIBE_LOOP_DEFAULT;
  }
  if (raw === "false") {
    return false;
  }
  if (raw === "true") {
    return true;
  }
  return DESCRIBE_LOOP_DEFAULT;
}

export function writeStoredDescribeLoop(
  storage: Pick<Storage, "setItem"> | null | undefined,
  value: boolean,
): void {
  if (!storage) {
    return;
  }
  storage.setItem(DESCRIBE_LOOP_STORAGE_KEY, value ? "true" : "false");
}
