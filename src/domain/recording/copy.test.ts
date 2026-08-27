import { describe, expect, it } from "vitest";
import { formatElapsedLabel, recordingExportedMessage } from "./copy";

describe("formatElapsedLabel (FR-041)", () => {
  it("shows minutes and seconds under an hour", () => {
    expect(formatElapsedLabel(0)).toBe("00:00");
    expect(formatElapsedLabel(9_000)).toBe("00:09");
    expect(formatElapsedLabel(754_000)).toBe("12:34");
  });

  it("adds hours beyond sixty minutes", () => {
    expect(formatElapsedLabel(3_723_000)).toBe("1:02:03");
  });

  it("never shows a negative duration", () => {
    expect(formatElapsedLabel(-5_000)).toBe("00:00");
  });
});

describe("recordingExportedMessage (FR-041)", () => {
  it("names the created file", () => {
    expect(recordingExportedMessage("ride-2026-08-25-1430.gpx")).toContain(
      "ride-2026-08-25-1430.gpx",
    );
  });
});
