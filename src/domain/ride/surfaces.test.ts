import { describe, expect, it } from "vitest";
import {
  UNKNOWN_SURFACE_WARNING,
  excludeKnownUnpaved,
  isKnownPavedSurface,
  usesKnownUnpaved,
  usesUnknownSurface,
  withUnknownSurfaceSignal,
} from "./surfaces";
import type { RouteSegment } from "./types";

function segment(
  partial: Partial<RouteSegment> & Pick<RouteSegment, "id">,
): RouteSegment {
  return {
    geometry: { type: "LineString", coordinates: [[0, 0], [1, 0]] },
    distanceKm: 10,
    durationMinutes: 8,
    ...partial,
  };
}

describe("isKnownPavedSurface (FR-008)", () => {
  it("accepts only the explicit paved token", () => {
    expect(isKnownPavedSurface("paved")).toBe(true);
    expect(isKnownPavedSurface("unpaved")).toBe(false);
    expect(isKnownPavedSurface("unknown")).toBe(false);
    expect(isKnownPavedSurface(undefined)).toBe(false);
  });
});

describe("usesUnknownSurface (FR-008)", () => {
  it("detects an explicit unknown surface", () => {
    expect(
      usesUnknownSurface([
        segment({ id: "paved", surface: "paved" }),
        segment({ id: "unknown", surface: "unknown" }),
      ]),
    ).toBe(true);
  });

  it("treats a missing surface as unknown, not paved", () => {
    expect(usesUnknownSurface([segment({ id: "bare" })])).toBe(true);
    expect(isKnownPavedSurface(segment({ id: "bare" }).surface)).toBe(false);
  });

  it("does not treat known paved or unpaved as unknown", () => {
    expect(
      usesUnknownSurface([
        segment({ id: "paved", surface: "paved" }),
        segment({ id: "unpaved", surface: "unpaved" }),
      ]),
    ).toBe(false);
  });
});

describe("usesKnownUnpaved (BR-007)", () => {
  it("does not treat unknown surface as known unpaved", () => {
    expect(
      usesKnownUnpaved([
        segment({ id: "paved", surface: "paved" }),
        segment({ id: "unknown", surface: "unknown" }),
        segment({ id: "bare" }),
      ]),
    ).toBe(false);
  });
});

describe("excludeKnownUnpaved (FR-008, BR-007)", () => {
  const paved = { id: "paved", unpaved: false };
  const unpaved = { id: "unpaved", unpaved: true };

  it("drops known unpaved candidates when avoidance is on", () => {
    expect(
      excludeKnownUnpaved(
        [unpaved, paved],
        (candidate) => candidate.unpaved,
        true,
      ),
    ).toEqual([paved]);
  });

  it("does not fall back onto known unpaved when nothing else remains", () => {
    expect(
      excludeKnownUnpaved([unpaved], (candidate) => candidate.unpaved, true),
    ).toEqual([]);
  });

  it("does not filter when the preference is off", () => {
    expect(
      excludeKnownUnpaved(
        [unpaved, paved],
        (candidate) => candidate.unpaved,
        false,
      ),
    ).toEqual([unpaved, paved]);
  });
});

describe("withUnknownSurfaceSignal (FR-008)", () => {
  it("warns when an included segment has an unknown surface", () => {
    const evaluation = {
      candidate: {
        segments: [segment({ id: "unknown", surface: "unknown" })],
      },
      warnings: [] as string[],
    };

    expect(withUnknownSurfaceSignal(evaluation).warnings).toEqual([
      UNKNOWN_SURFACE_WARNING,
    ]);
  });

  it("does not warn when every surface is known", () => {
    expect(
      withUnknownSurfaceSignal({
        candidate: {
          segments: [
            segment({ id: "paved", surface: "paved" }),
            segment({ id: "unpaved", surface: "unpaved" }),
          ],
        },
        warnings: [],
      }).warnings,
    ).toEqual([]);
  });

  it("does not duplicate an existing unknown-surface warning", () => {
    const evaluation = {
      candidate: {
        segments: [segment({ id: "bare" })],
      },
      warnings: [UNKNOWN_SURFACE_WARNING],
    };

    expect(withUnknownSurfaceSignal(evaluation).warnings).toEqual([
      UNKNOWN_SURFACE_WARNING,
    ]);
  });
});
