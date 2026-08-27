import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { offsetCoordinates } from "@/domain/geo/distance";
import type {
  LocationWatch,
  LocationWatchEvent,
} from "@/domain/location/types";
import type { LocationFix } from "@/domain/navigation/types";
import type { GpxExportOutcome, GpxFilePayload } from "@/infrastructure/export/gpx-file-export";
import { TrackRecorderControl } from "./track-recorder-control";
import { useTrackRecorder } from "./use-track-recorder";

const START_MS = new Date(2026, 7, 25, 14, 30, 0).getTime();

function createFakeWatch() {
  const listeners = new Set<(event: LocationWatchEvent) => void>();
  let starts = 0;
  const watch: LocationWatch = {
    start() {
      starts += 1;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    activeNativeWatches() {
      return listeners.size > 0 ? 1 : 0;
    },
  };
  return {
    watch,
    emit(event: LocationWatchEvent) {
      act(() => {
        for (const listener of [...listeners]) {
          listener(event);
        }
      });
    },
    listenerCount: () => listeners.size,
    startCount: () => starts,
  };
}

function fixAt(index: number, meters = 60, accuracy = 6): LocationWatchEvent {
  const moved = offsetCoordinates(
    { latitude: 45.4, longitude: -72.73 },
    90,
    (meters * index) / 1_000,
  );
  const fix: LocationFix = {
    coordinates: moved,
    accuracyMeters: accuracy,
    altitudeMeters: 130 + index,
    recordedAtMs: START_MS + index * 2_000,
  };
  return { type: "fix", fix };
}

function Harness({
  watch,
  exportFile,
}: {
  watch: LocationWatch;
  exportFile?: (payload: GpxFilePayload) => Promise<GpxExportOutcome>;
}) {
  const recorder = useTrackRecorder({
    locationWatch: watch,
    now: () => START_MS,
    exportFile,
  });
  return (
    <>
      <TrackRecorderControl recorder={recorder} now={() => START_MS} />
      <output data-testid="recorded-points">{recorder.state.points.length}</output>
      <output data-testid="recorded-status">{recorder.state.status}</output>
      <output data-testid="overlay-points">
        {recorder.overlay?.geometry.coordinates.length ?? 0}
      </output>
    </>
  );
}

function startRecording(harness: ReturnType<typeof createFakeWatch>) {
  fireEvent.click(screen.getByRole("button", { name: /Démarrer l’enregistrement/ }));
  harness.emit(fixAt(0));
  harness.emit(fixAt(1));
}

describe("TrackRecorderControl (FR-041)", () => {
  it("offers a single start action before any recording", () => {
    const harness = createFakeWatch();
    render(<Harness watch={harness.watch} />);
    expect(
      screen.getByRole("button", { name: /Démarrer l’enregistrement/ }),
    ).toBeInTheDocument();
    expect(harness.listenerCount()).toBe(0);
  });

  it("opens the shared GPS watch inside the tap and waits for a fix", () => {
    const harness = createFakeWatch();
    render(<Harness watch={harness.watch} />);

    fireEvent.click(screen.getByRole("button", { name: /Démarrer l’enregistrement/ }));

    expect(harness.startCount()).toBe(1);
    expect(harness.listenerCount()).toBe(1);
    expect(screen.getByText(/Recherche du signal GPS/)).toBeInTheDocument();
    expect(screen.getByTestId("recorded-status")).toHaveTextContent(
      "requesting-permission",
    );
  });

  it("records accepted fixes, the distance and the map line", () => {
    const harness = createFakeWatch();
    render(<Harness watch={harness.watch} />);
    startRecording(harness);

    expect(screen.getByText("Enregistrement en cours")).toBeInTheDocument();
    expect(screen.getByTestId("recorded-points")).toHaveTextContent("2");
    expect(screen.getByTestId("overlay-points")).toHaveTextContent("2");
    expect(screen.getByText("60 m")).toBeInTheDocument();
    expect(screen.getByText("00:00")).toBeInTheDocument();
  });

  it("ignores duplicated, standstill and invalid fixes", () => {
    const harness = createFakeWatch();
    render(<Harness watch={harness.watch} />);
    startRecording(harness);

    harness.emit(fixAt(1));
    harness.emit(fixAt(1.02));
    harness.emit({
      type: "fix",
      fix: {
        coordinates: { latitude: Number.NaN, longitude: -72.7 },
        accuracyMeters: 5,
        recordedAtMs: START_MS + 9_000,
      },
    });
    harness.emit(fixAt(2, 60, 400));

    expect(screen.getByTestId("recorded-points")).toHaveTextContent("2");
  });

  it("explains a refused location permission without a raw error", () => {
    const harness = createFakeWatch();
    render(<Harness watch={harness.watch} />);
    fireEvent.click(screen.getByRole("button", { name: /Démarrer l’enregistrement/ }));

    harness.emit({
      type: "error",
      error: { code: "PERMISSION_DENIED", message: "kCLErrorDenied" },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      /autorisation de localisation a été refusée/,
    );
    expect(screen.queryByText(/kCLErrorDenied/)).not.toBeInTheDocument();
    expect(harness.listenerCount()).toBe(0);
  });

  it("keeps recording and warns when the signal drops", () => {
    const harness = createFakeWatch();
    render(<Harness watch={harness.watch} />);
    startRecording(harness);

    harness.emit({
      type: "error",
      error: { code: "POSITION_UNAVAILABLE", message: "raw" },
    });

    expect(screen.getByText("Enregistrement en cours")).toBeInTheDocument();
    expect(screen.getByText(/Aucun signal GPS utilisable/)).toBeInTheDocument();
    expect(harness.listenerCount()).toBe(1);
  });

  it("releases the GPS watch on stop and offers the two preview actions", () => {
    const harness = createFakeWatch();
    render(<Harness watch={harness.watch} />);
    startRecording(harness);

    fireEvent.click(screen.getByRole("button", { name: /Arrêter l’enregistrement/ }));

    expect(harness.listenerCount()).toBe(0);
    expect(harness.watch.activeNativeWatches()).toBe(0);
    expect(screen.getByTestId("recorded-status")).toHaveTextContent("preview");
    expect(
      screen.getByRole("button", { name: /Sauvegarder en GPX/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Supprimer$/ })).toBeInTheDocument();
    expect(screen.getByTestId("recorded-points")).toHaveTextContent("2");
  });

  it("reports a track that is too short to export", () => {
    const harness = createFakeWatch();
    render(<Harness watch={harness.watch} />);
    fireEvent.click(screen.getByRole("button", { name: /Démarrer l’enregistrement/ }));
    harness.emit(fixAt(0));

    fireEvent.click(screen.getByRole("button", { name: /Arrêter l’enregistrement/ }));

    expect(screen.getByRole("alert")).toHaveTextContent(/pas assez de points/);
    expect(
      screen.queryByRole("button", { name: /Sauvegarder en GPX/ }),
    ).not.toBeInTheDocument();
    expect(harness.listenerCount()).toBe(0);
  });

  it("closes a permission error without asking to delete anything", () => {
    const harness = createFakeWatch();
    render(<Harness watch={harness.watch} />);
    fireEvent.click(screen.getByRole("button", { name: /Démarrer l’enregistrement/ }));
    harness.emit({
      type: "error",
      error: { code: "PERMISSION_DENIED", message: "raw" },
    });

    expect(screen.queryByRole("button", { name: /^Supprimer$/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Fermer/ }));

    expect(screen.getByTestId("recorded-status")).toHaveTextContent("idle");
    expect(
      screen.getByRole("button", { name: /Démarrer l’enregistrement/ }),
    ).toBeInTheDocument();
  });

  it("returns to the start action when stopped before the first fix", () => {
    const harness = createFakeWatch();
    render(<Harness watch={harness.watch} />);
    fireEvent.click(screen.getByRole("button", { name: /Démarrer l’enregistrement/ }));

    fireEvent.click(screen.getByRole("button", { name: /Arrêter l’enregistrement/ }));

    expect(screen.getByTestId("recorded-status")).toHaveTextContent("idle");
    expect(harness.listenerCount()).toBe(0);
    expect(
      screen.getByRole("button", { name: /Démarrer l’enregistrement/ }),
    ).toBeInTheDocument();
  });

  it("never starts two recordings at once", () => {
    const harness = createFakeWatch();
    render(<Harness watch={harness.watch} />);
    startRecording(harness);

    expect(
      screen.queryByRole("button", { name: /Démarrer l’enregistrement/ }),
    ).not.toBeInTheDocument();
    expect(harness.listenerCount()).toBe(1);
    expect(harness.watch.activeNativeWatches()).toBe(1);
  });

  it("exports a GPX 1.1 file and confirms the save", async () => {
    const exportFile = vi.fn<(payload: GpxFilePayload) => Promise<GpxExportOutcome>>(
      async () => "share",
    );
    const harness = createFakeWatch();
    render(<Harness watch={harness.watch} exportFile={exportFile} />);
    startRecording(harness);
    fireEvent.click(screen.getByRole("button", { name: /Arrêter l’enregistrement/ }));

    fireEvent.click(screen.getByRole("button", { name: /Sauvegarder en GPX/ }));

    await waitFor(() => expect(exportFile).toHaveBeenCalledTimes(1));
    const payload = exportFile.mock.calls[0]![0];
    expect(payload.fileName).toBe("ride-2026-08-25-1430.gpx");
    expect(payload.contents).toContain('<gpx version="1.1" creator="Ride"');
    expect(payload.contents.match(/<trkpt /g)).toHaveLength(2);
    expect(payload.contents).toContain("<ele>130</ele>");
    expect(
      await screen.findByText(/Parcours enregistré dans ride-2026-08-25-1430\.gpx/),
    ).toBeInTheDocument();
  });

  it("exports once even on a double tap", async () => {
    let release: (() => void) | null = null;
    const exportFile = vi.fn<(payload: GpxFilePayload) => Promise<GpxExportOutcome>>(
      () =>
        new Promise<GpxExportOutcome>((resolve) => {
          release = () => resolve("download");
        }),
    );
    const harness = createFakeWatch();
    render(<Harness watch={harness.watch} exportFile={exportFile} />);
    startRecording(harness);
    fireEvent.click(screen.getByRole("button", { name: /Arrêter l’enregistrement/ }));

    const save = screen.getByRole("button", { name: /Sauvegarder en GPX/ });
    fireEvent.click(save);
    fireEvent.click(save);

    expect(exportFile).toHaveBeenCalledTimes(1);
    await act(async () => {
      release?.();
    });
    expect(exportFile).toHaveBeenCalledTimes(1);
  });

  it("keeps the track when the export fails", async () => {
    const exportFile = vi.fn<(payload: GpxFilePayload) => Promise<GpxExportOutcome>>(
      async () => {
        throw new Error("share unavailable");
      },
    );
    const harness = createFakeWatch();
    render(<Harness watch={harness.watch} exportFile={exportFile} />);
    startRecording(harness);
    fireEvent.click(screen.getByRole("button", { name: /Arrêter l’enregistrement/ }));

    fireEvent.click(screen.getByRole("button", { name: /Sauvegarder en GPX/ }));

    expect(
      await screen.findByText(/n’a pas pu être créé/),
    ).toBeInTheDocument();
    expect(screen.getByTestId("recorded-points")).toHaveTextContent("2");
    expect(screen.queryByText(/share unavailable/)).not.toBeInTheDocument();
  });

  it("asks for a confirmation before deleting, and keeps the track on refusal", () => {
    const harness = createFakeWatch();
    render(<Harness watch={harness.watch} />);
    startRecording(harness);
    fireEvent.click(screen.getByRole("button", { name: /Arrêter l’enregistrement/ }));

    fireEvent.click(screen.getByRole("button", { name: /^Supprimer$/ }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/irréversible/);

    fireEvent.click(screen.getByRole("button", { name: /Conserver/ }));
    expect(screen.getByTestId("recorded-points")).toHaveTextContent("2");
    expect(screen.getByTestId("recorded-status")).toHaveTextContent("preview");
  });

  it("clears the track, the map line and the GPS watch once the delete is confirmed", () => {
    const harness = createFakeWatch();
    render(<Harness watch={harness.watch} />);
    startRecording(harness);
    fireEvent.click(screen.getByRole("button", { name: /Arrêter l’enregistrement/ }));

    fireEvent.click(screen.getByRole("button", { name: /^Supprimer$/ }));
    fireEvent.click(screen.getByRole("button", { name: /Supprimer définitivement/ }));

    expect(screen.getByTestId("recorded-status")).toHaveTextContent("idle");
    expect(screen.getByTestId("recorded-points")).toHaveTextContent("0");
    expect(screen.getByTestId("overlay-points")).toHaveTextContent("0");
    expect(harness.listenerCount()).toBe(0);
    expect(harness.watch.activeNativeWatches()).toBe(0);
    expect(
      screen.getByRole("button", { name: /Démarrer l’enregistrement/ }),
    ).toBeInTheDocument();
  });
});
