import { describe, expect, it } from "vitest";
import type { LineString } from "@/domain/geo/types";
import { previousRideSignature } from "./route-signature";

const geometry: LineString = {
  type: "LineString",
  coordinates: [
    [-72.734, 45.4],
    [-72.7, 45.45],
    [-72.734, 45.4],
  ],
};

describe("previousRideSignature (FR-034, FR-012)", () => {
  it("is stable for the same geometry and id", () => {
    expect(previousRideSignature({ id: "route-1", geometry })).toBe(
      previousRideSignature({ id: "route-1", geometry }),
    );
  });

  it("changes when the corridor or id changes", () => {
    const other: LineString = {
      type: "LineString",
      coordinates: [
        [-72.8, 45.3],
        [-72.6, 45.5],
        [-72.8, 45.3],
      ],
    };
    const first = previousRideSignature({ id: "route-1", geometry });
    expect(previousRideSignature({ id: "route-2", geometry })).not.toBe(first);
    expect(previousRideSignature({ id: "route-1", geometry: other })).not.toBe(
      first,
    );
  });
});
