/**
 * FR-034 — transport-only flags. Domain schemas strip them.
 * Nested `request` covers regenerate envelopes.
 */
export function isAiWebGenerationRequested(input: unknown): boolean {
  if (typeof input !== "object" || input === null) {
    return false;
  }
  const record = input as Record<string, unknown>;
  if (record.useAiWebGeneration === true) {
    return true;
  }
  if ("request" in record) {
    return isAiWebGenerationRequested(record.request);
  }
  return false;
}

export function readOriginAccuracyMeters(input: unknown): number | null {
  const raw = readNestedNumber(input, "originAccuracyMeters");
  if (raw === undefined || !Number.isFinite(raw) || raw < 0) {
    return null;
  }
  return raw;
}

export function readPreviousRouteSignature(input: unknown): string | undefined {
  const value = readNestedString(input, "previousRouteSignature");
  return value || undefined;
}

/**
 * FR-034 — omitted or true closes the ride at the origin. Explicit false
 * requests a one-way of the chosen distance.
 */
export function readReturnToStart(input: unknown): boolean {
  const value = readNestedBoolean(input, "returnToStart");
  if (value === false) {
    return false;
  }
  if (value === true) {
    return true;
  }
  return true;
}

function readNestedNumber(input: unknown, key: string): number | undefined {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }
  const record = input as Record<string, unknown>;
  if (typeof record[key] === "number") {
    return record[key];
  }
  if ("request" in record) {
    return readNestedNumber(record.request, key);
  }
  return undefined;
}

function readNestedString(input: unknown, key: string): string | undefined {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }
  const record = input as Record<string, unknown>;
  if (typeof record[key] === "string") {
    return record[key];
  }
  if ("request" in record) {
    return readNestedString(record.request, key);
  }
  return undefined;
}

function readNestedBoolean(input: unknown, key: string): boolean | undefined {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }
  const record = input as Record<string, unknown>;
  if (typeof record[key] === "boolean") {
    return record[key];
  }
  if ("request" in record) {
    return readNestedBoolean(record.request, key);
  }
  return undefined;
}
