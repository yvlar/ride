import { describe, expect, it } from "vitest";
import { GPX_FILE_ACCEPT } from "./constants";
import { gpxFileInputAccept, isAcceptableGpxFile } from "./file-accept";

describe("GPX file picker (FR-039)", () => {
  it("accepts iPhone / PWA MIME gaps when the name ends with .gpx", () => {
    expect(isAcceptableGpxFile({ name: "sortie.gpx", type: "" })).toBe(true);
    expect(
      isAcceptableGpxFile({ name: "sortie.gpx", type: "application/octet-stream" }),
    ).toBe(true);
    expect(
      isAcceptableGpxFile({ name: "trace.GPX", type: "application/gpx+xml" }),
    ).toBe(true);
  });

  it("accepts XML MIME types used by mobile browsers", () => {
    expect(
      isAcceptableGpxFile({ name: "untitled", type: "application/gpx+xml" }),
    ).toBe(true);
    expect(isAcceptableGpxFile({ name: "untitled", type: "application/xml" })).toBe(
      true,
    );
    expect(isAcceptableGpxFile({ name: "untitled", type: "text/xml" })).toBe(true);
  });

  it("rejects an unrelated file without a GPX name or MIME type", () => {
    expect(isAcceptableGpxFile({ name: "photo.jpg", type: "image/jpeg" })).toBe(
      false,
    );
    expect(isAcceptableGpxFile({ name: "notes.txt", type: "" })).toBe(false);
  });

  it("exposes the iOS-compatible accept attribute", () => {
    expect(gpxFileInputAccept()).toBe(GPX_FILE_ACCEPT);
    expect(gpxFileInputAccept()).toContain(".gpx");
    expect(gpxFileInputAccept()).toContain("application/octet-stream");
    expect(gpxFileInputAccept()).toContain("application/gpx+xml");
    expect(gpxFileInputAccept()).toContain("application/xml");
    expect(gpxFileInputAccept()).toContain("text/xml");
    expect(gpxFileInputAccept().startsWith("application/octet-stream")).toBe(
      true,
    );
  });
});
