import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { gpxFileInputAccept } from "@/domain/gpx/file-accept";
import {
  DEFAULT_ROUTE_PREFERENCES,
  ROUTE_PREFERENCES_STORAGE_KEY,
  writeStoredRoutePreferences,
} from "@/domain/ride/stored-route-preferences";
import { ImportGpxPanel } from "./import-gpx-panel";

const TRACK = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Cantons</name>
    <trkseg>
      <trkpt lat="45.4000" lon="-72.7300"/>
      <trkpt lat="45.4100" lon="-72.7100"/>
    </trkseg>
  </trk>
</gpx>`;

const MULTI = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Trace A</name>
    <trkseg>
      <trkpt lat="45.40" lon="-72.73"/>
      <trkpt lat="45.41" lon="-72.72"/>
    </trkseg>
  </trk>
  <trk>
    <name>Trace B</name>
    <trkseg>
      <trkpt lat="46.10" lon="-74.50"/>
      <trkpt lat="46.11" lon="-74.49"/>
    </trkseg>
  </trk>
</gpx>`;

const ROUTE = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <name>Route 112</name>
    <rtept lat="45.40" lon="-72.73"/>
    <rtept lat="45.41" lon="-72.60"/>
  </rte>
</gpx>`;

function upload(xml: string, name = "sortie.gpx", type = "application/gpx+xml") {
  const input = screen.getByTestId("gpx-file-input") as HTMLInputElement;
  const file = new File([xml], name, { type });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("ImportGpxPanel (FR-039)", () => {
  beforeEach(() => {
    window.localStorage.removeItem(ROUTE_PREFERENCES_STORAGE_KEY);
  });

  it("uses an iPhone-compatible hidden file input", () => {
    render(
      <ImportGpxPanel
        onPreview={() => {}}
        onStartNavigation={() => {}}
        onBack={() => {}}
      />,
    );
    const input = screen.getByTestId("gpx-file-input");
    expect(input).toHaveAttribute("accept", gpxFileInputAccept());
    expect(input).not.toHaveAttribute("capture");
    expect(input).toHaveAttribute("type", "file");
  });

  it("previews a track with name, distance, start and end", async () => {
    const onPreview = vi.fn();
    render(
      <ImportGpxPanel
        onPreview={onPreview}
        onStartNavigation={() => {}}
        onBack={() => {}}
      />,
    );
    upload(TRACK);
    await waitFor(() => {
      expect(screen.getByText("Cantons")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Démarrer la navigation" })).toBeEnabled();
    expect(screen.getByText(/Départ/)).toBeInTheDocument();
    expect(screen.getByText(/Arrivée/)).toBeInTheDocument();
    expect(onPreview).toHaveBeenCalled();
    expect(onPreview.mock.calls.at(-1)?.[0]?.source).toBe("gpx");
    expect(onPreview.mock.calls.at(-1)?.[1]?.preferences).toEqual(
      DEFAULT_ROUTE_PREFERENCES,
    );
  });

  it("lets the user pick among multiple trips", async () => {
    render(
      <ImportGpxPanel
        onPreview={() => {}}
        onStartNavigation={() => {}}
        onBack={() => {}}
      />,
    );
    upload(MULTI);
    await waitFor(() => {
      expect(screen.getAllByText(/plusieurs trajets/i).length).toBeGreaterThan(0);
    });
    expect(screen.getByRole("radio", { name: /Trace A/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("radio", { name: /Trace B/ }));
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: /Trace B/ })).toHaveAttribute(
        "aria-checked",
        "true",
      );
    });
  });

  it("does not preview a straight-line fake when route snapping fails", async () => {
    const snapWaypoints = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: "PROVIDER_ERROR" as const,
        message: "Le moteur de routage n’a pas pu relier les points de la route GPX.",
        suggestions: ["Réessayez."],
      },
    }));
    render(
      <ImportGpxPanel
        snapWaypoints={snapWaypoints}
        onPreview={() => {}}
        onStartNavigation={() => {}}
        onBack={() => {}}
      />,
    );
    upload(ROUTE);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/moteur de routage/i);
    });
    expect(
      screen.queryByRole("button", { name: "Démarrer la navigation" }),
    ).not.toBeInTheDocument();
  });

  it("shows a readable error for a waypoint-only file", async () => {
    render(
      <ImportGpxPanel
        onPreview={() => {}}
        onStartNavigation={() => {}}
        onBack={() => {}}
      />,
    );
    upload(
      `<?xml version="1.0"?><gpx version="1.1"><wpt lat="45.4" lon="-72.73"/></gpx>`,
    );
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/points de passage/i);
    });
  });

  it("cancels the preview without starting navigation", async () => {
    const onBack = vi.fn();
    const onStart = vi.fn();
    render(
      <ImportGpxPanel
        onPreview={() => {}}
        onStartNavigation={onStart}
        onBack={onBack}
      />,
    );
    upload(TRACK);
    await waitFor(() => {
      expect(screen.getByText("Cantons")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(onBack).toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
  });

  it("forwards Réglages preferences into the GPX request and <rte> snap (FR-007, FR-008, FR-030, FR-039)", async () => {
    writeStoredRoutePreferences(window.localStorage, {
      avoidHighways: false,
      avoidUnpaved: false,
      stayInCanada: true,
    });
    const onPreview = vi.fn();
    const snapWaypoints = vi.fn(async () => ({
      ok: true as const,
      route: {
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [-72.73, 45.4],
            [-72.6, 45.41],
          ] as [number, number][],
        },
        segments: [],
        distanceKm: 10,
        durationMinutes: 12,
      },
    }));
    render(
      <ImportGpxPanel
        snapWaypoints={snapWaypoints}
        onPreview={onPreview}
        onStartNavigation={() => {}}
        onBack={() => {}}
      />,
    );
    upload(ROUTE);
    await waitFor(() => {
      expect(snapWaypoints).toHaveBeenCalled();
    });
    expect(snapWaypoints).toHaveBeenCalledWith(
      expect.objectContaining({
        preferences: {
          avoidHighways: false,
          avoidUnpaved: false,
          stayInCanada: true,
        },
      }),
      expect.any(AbortSignal),
    );
    expect(onPreview.mock.calls.at(-1)?.[1]?.preferences).toEqual({
      avoidHighways: false,
      avoidUnpaved: false,
      stayInCanada: true,
    });
  });
});
