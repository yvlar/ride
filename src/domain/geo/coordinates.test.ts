import { describe, expect, it } from "vitest";
import { hasValidCoordinates } from "./coordinates";

describe("hasValidCoordinates", () => {
  it("accepts finite coordinates inside the geographic ranges", () => {
    expect(
      hasValidCoordinates({ latitude: 45.4001, longitude: -72.7342 }),
    ).toBe(true);
  });

  it("rejects missing, non-finite, and out-of-range coordinates", () => {
    expect(hasValidCoordinates(null)).toBe(false);
    expect(
      hasValidCoordinates({ latitude: Number.NaN, longitude: -72.7342 }),
    ).toBe(false);
    expect(hasValidCoordinates({ latitude: 91, longitude: -72.7342 })).toBe(
      false,
    );
    expect(hasValidCoordinates({ latitude: 45.4, longitude: -181 })).toBe(
      false,
    );
  });
});
