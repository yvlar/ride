import { describe, expect, it } from "vitest";
import type { RecordedTrackPoint } from "@/domain/recording/types";
import { GPX_EXPORT_MIME_TYPE } from "./constants";
import { parseGpxDocument } from "./parse";
import {
  composeRecordedTrackGpx,
  escapeXml,
  recordedTrackFileName,
  recordedTrackName,
  toGpxTime,
} from "./serialize";

const points: RecordedTrackPoint[] = [
  {
    latitude: 45.4001234,
    longitude: -72.7342567,
    timestamp: Date.UTC(2026, 7, 25, 18, 30, 0),
    altitude: 128.42,
    accuracy: 6,
  },
  {
    latitude: 45.4011234,
    longitude: -72.7332567,
    timestamp: Date.UTC(2026, 7, 25, 18, 30, 10),
    altitude: null,
    accuracy: 7,
  },
];

describe("composeRecordedTrackGpx (FR-041)", () => {
  const gpx = composeRecordedTrackGpx({ name: "Parcours test", points });

  it("declares a GPX 1.1 document created by Ride", () => {
    expect(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(gpx).toContain('version="1.1"');
    expect(gpx).toContain('creator="Ride"');
    expect(gpx).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
  });

  it("uses a track, a segment and track points", () => {
    expect(gpx).toContain("<trk>");
    expect(gpx).toContain("<trkseg>");
    expect(gpx.match(/<trkpt /g)).toHaveLength(2);
    expect(gpx).not.toContain("<rte>");
    expect(gpx).not.toContain("<wpt ");
  });

  it("carries the metadata name and time", () => {
    expect(gpx).toContain("<metadata>");
    expect(gpx).toContain("<name>Parcours test</name>");
    expect(gpx).toContain(`<time>${toGpxTime(points[0]!.timestamp)}</time>`);
  });

  it("keeps latitude, longitude and ISO 8601 UTC timestamps", () => {
    expect(gpx).toContain('lat="45.4001234"');
    expect(gpx).toContain('lon="-72.7342567"');
    expect(gpx).toContain("<time>2026-08-25T18:30:00.000Z</time>");
    expect(gpx).toContain("<time>2026-08-25T18:30:10.000Z</time>");
  });

  it("adds the elevation only when the device provided one", () => {
    expect(gpx).toContain("<ele>128.4</ele>");
    expect(gpx.match(/<ele>/g)).toHaveLength(1);
  });

  it("is parsed back by the existing GPX reader (FR-039)", () => {
    const parsed = parseGpxDocument(gpx, "ride-2026-08-25-1430.gpx");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.trips).toHaveLength(1);
    expect(parsed.trips[0]!.kind).toBe("track");
    expect(parsed.trips[0]!.name).toBe("Parcours test");
    expect(parsed.trips[0]!.parts[0]!.points).toHaveLength(2);
    expect(parsed.trips[0]!.parts[0]!.points[0]!.coordinates.latitude).toBeCloseTo(
      45.4001234,
      6,
    );
  });

  it("escapes XML metacharacters in the name", () => {
    const dangerous = composeRecordedTrackGpx({
      name: 'Parcours <b>"A & B"</b>',
      points,
    });
    expect(dangerous).toContain(
      "<name>Parcours &lt;b&gt;&quot;A &amp; B&quot;&lt;/b&gt;</name>",
    );
    expect(dangerous).not.toContain("<b>");
    expect(parseGpxDocument(dangerous, "x.gpx").ok).toBe(true);
  });

  it("refuses to serialize an empty track", () => {
    expect(() => composeRecordedTrackGpx({ name: "vide", points: [] })).toThrow();
  });
});

describe("escapeXml (FR-041)", () => {
  it("escapes the five XML metacharacters", () => {
    expect(escapeXml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&apos;");
  });
});

describe("recordedTrackFileName (FR-041)", () => {
  it("builds a ride-YYYY-MM-DD-HHmm.gpx name from the local clock", () => {
    const startedAt = new Date(2026, 7, 25, 14, 30, 12).getTime();
    expect(recordedTrackFileName(startedAt)).toBe("ride-2026-08-25-1430.gpx");
  });

  it("pads single digit months, days, hours and minutes", () => {
    const startedAt = new Date(2026, 0, 5, 9, 7, 0).getTime();
    expect(recordedTrackFileName(startedAt)).toBe("ride-2026-01-05-0907.gpx");
  });

  it("names the track from the same local stamp", () => {
    const startedAt = new Date(2026, 7, 25, 14, 30, 0).getTime();
    expect(recordedTrackName(startedAt)).toBe("Parcours du 2026-08-25 à 14:30");
  });
});

describe("GPX export MIME type (FR-041)", () => {
  it("is application/gpx+xml", () => {
    expect(GPX_EXPORT_MIME_TYPE).toBe("application/gpx+xml");
  });
});
