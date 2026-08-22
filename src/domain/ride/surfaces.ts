import { usesKnownUnpaved } from "./constraints";
import type { RouteSegment } from "./types";

export { usesKnownUnpaved };

export const UNKNOWN_SURFACE_WARNING =
  "La surface de certains segments est inconnue. Vérifiez le trajet avant le départ.";

/** FR-008 — only an explicit paved token counts as paved. */
export function isKnownPavedSurface(
  surface: RouteSegment["surface"],
): boolean {
  return surface === "paved";
}

/**
 * FR-008 — missing or `"unknown"` surface. Never treat these as paved,
 * and never treat them as known unpaved (BR-007).
 */
export function usesUnknownSurface(segments: RouteSegment[]): boolean {
  return segments.some(
    (segment) =>
      segment.surface === undefined || segment.surface === "unknown",
  );
}

/**
 * FR-008 / BR-007 — known unpaved is a hard exclusion. Unlike FR-007,
 * there is no fallback onto a forbidden surface.
 */
export function excludeKnownUnpaved<T>(
  candidates: readonly T[],
  candidateUsesKnownUnpaved: (candidate: T) => boolean,
  avoidUnpaved: boolean,
): T[] {
  if (!avoidUnpaved) {
    return [...candidates];
  }

  return candidates.filter(
    (candidate) => !candidateUsesKnownUnpaved(candidate),
  );
}

export function withUnknownSurfaceSignal<
  T extends { warnings: string[]; candidate: { segments: RouteSegment[] } },
>(evaluation: T): T {
  if (!usesUnknownSurface(evaluation.candidate.segments)) {
    return evaluation;
  }

  if (evaluation.warnings.includes(UNKNOWN_SURFACE_WARNING)) {
    return evaluation;
  }

  return {
    ...evaluation,
    warnings: [...evaluation.warnings, UNKNOWN_SURFACE_WARNING],
  };
}
