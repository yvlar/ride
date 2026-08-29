import { describe, expect, it } from "vitest";
import { parseGpxDocument } from "./parse";

const GPX11 = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Ride" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Boucle Estriade</name></metadata>
  <trk>
    <name>Trace principale</name>
    <desc>Sortie du samedi</desc>
    <trkseg>
      <trkpt lat="45.4000" lon="-72.7300"><ele>120</ele><time>2026-08-01T12:00:00Z</time></trkpt>
      <trkpt lat="45.4010" lon="-72.7200"/>
      <trkpt lat="45.4020" lon="-72.7100"/>
    </trkseg>
  </trk>
</gpx>`;

const GPX10 = `<?xml version="1.0"?>
<gpx version="1.0" creator="Ride" xmlns="http://www.topografix.com/GPX/1/0">
  <name>GPX 1.0</name>
  <trk>
    <name>Sans segments</name>
    <trkpt lat="45.40" lon="-72.73"/>
    <trkpt lat="45.41" lon="-72.72"/>
  </trk>
</gpx>`;

const NAMESPACED = `<?xml version="1.0" encoding="UTF-8"?>
<gpx:gpx version="1.1" xmlns:gpx="http://www.topografix.com/GPX/1/1">
  <gpx:trk>
    <gpx:name>Préfixe</gpx:name>
    <gpx:trkseg>
      <gpx:trkpt lat="45.40" lon="-72.73"/>
      <gpx:trkpt lat="45.41" lon="-72.72"/>
    </gpx:trkseg>
  </gpx:trk>
</gpx:gpx>`;

const ROUTE_ONLY = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <name>Route 112</name>
    <rtept lat="45.40" lon="-72.73"/>
    <rtept lat="45.41" lon="-72.60"/>
    <rtept lat="45.42" lon="-72.50"/>
  </rte>
</gpx>`;

const MULTI_SEG = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Deux segments</name>
    <trkseg>
      <trkpt lat="45.40" lon="-72.73"/>
      <trkpt lat="45.401" lon="-72.72"/>
    </trkseg>
    <trkseg>
      <trkpt lat="45.50" lon="-72.50"/>
      <trkpt lat="45.51" lon="-72.49"/>
    </trkseg>
  </trk>
</gpx>`;

const MULTI_TRIP = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Trace A</name>
    <trkseg>
      <trkpt lat="45.40" lon="-72.73"/>
      <trkpt lat="45.41" lon="-72.72"/>
    </trkseg>
  </trk>
  <rte>
    <name>Route B</name>
    <rtept lat="46.10" lon="-74.50"/>
    <rtept lat="46.12" lon="-74.40"/>
  </rte>
</gpx>`;

describe("parseGpxDocument (FR-039)", () => {
  it("parses GPX 1.1 tracks with optional fields", () => {
    const result = parseGpxDocument(GPX11, "sortie.gpx");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.trips).toHaveLength(1);
    expect(result.trips[0]?.kind).toBe("track");
    expect(result.trips[0]?.name).toBe("Trace principale");
    expect(result.trips[0]?.description).toBe("Sortie du samedi");
    expect(result.trips[0]?.parts[0]?.points[0]?.elevationM).toBe(120);
    expect(result.trips[0]?.parts[0]?.points[0]?.time).toContain("2026");
  });

  it("parses GPX 1.0 tracks without trkseg wrappers", () => {
    const result = parseGpxDocument(GPX10, "old.gpx");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.trips[0]?.name).toBe("Sans segments");
    expect(result.trips[0]?.parts[0]?.points).toHaveLength(2);
  });

  it("reads namespaced XML elements", () => {
    const result = parseGpxDocument(NAMESPACED, "ns.gpx");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.trips[0]?.name).toBe("Préfixe");
    expect(result.trips[0]?.parts[0]?.points).toHaveLength(2);
  });

  it("imports an ordered <rte> without inventing extra trips", () => {
    const result = parseGpxDocument(ROUTE_ONLY, "route.gpx");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.trips).toHaveLength(1);
    expect(result.trips[0]?.kind).toBe("route");
    expect(result.trips[0]?.parts[0]?.points.map((point) => point.coordinates)).toEqual([
      { latitude: 45.4, longitude: -72.73 },
      { latitude: 45.41, longitude: -72.6 },
      { latitude: 45.42, longitude: -72.5 },
    ]);
  });

  it("keeps multiple trkseg as distinct parts", () => {
    const result = parseGpxDocument(MULTI_SEG, "gaps.gpx");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.trips[0]?.parts).toHaveLength(2);
  });

  it("does not silently merge independent trips", () => {
    const result = parseGpxDocument(MULTI_TRIP, "multi.gpx");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.trips).toHaveLength(2);
    expect(result.warnings).toHaveLength(0);
  });

  it("rejects an empty file", () => {
    const result = parseGpxDocument("   ", "empty.gpx");
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("EMPTY");
  });

  it("rejects corrupt XML", () => {
    const result = parseGpxDocument("<gpx><trk>", "bad.gpx");
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("CORRUPT");
  });

  it("rejects DOCTYPE / ENTITY payloads", () => {
    const result = parseGpxDocument(
      `<!DOCTYPE gpx [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><gpx></gpx>`,
      "xxe.gpx",
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("UNSAFE_XML");
  });

  it("rejects waypoint-only files", () => {
    const result = parseGpxDocument(
      `<?xml version="1.0"?><gpx version="1.1"><wpt lat="45.4" lon="-72.73"/></gpx>`,
      "wpt.gpx",
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("WAYPOINTS_ONLY");
  });

  it("rejects coordinates outside WGS84 bounds", () => {
    const result = parseGpxDocument(
      `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>
        <trkpt lat="95" lon="-72.73"/><trkpt lat="96" lon="-72.72"/>
      </trkseg></trk></gpx>`,
      "oob.gpx",
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("OUT_OF_BOUNDS");
  });

  it("rejects a track without usable coordinates", () => {
    const result = parseGpxDocument(
      `<?xml version="1.0"?><gpx version="1.1"><trk><name>Vide</name></trk></gpx>`,
      "none.gpx",
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("NO_TRIP");
  });
});
