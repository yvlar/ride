import { describe, expect, it, vi } from "vitest";
import { GPX_EXPORT_MIME_TYPE } from "@/domain/gpx/constants";
import {
  GpxFileExportError,
  exportGpxFile,
  type GpxFilePayload,
} from "./gpx-file-export";

const payload: GpxFilePayload = {
  fileName: "ride-2026-08-25-1430.gpx",
  contents: '<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1"></gpx>',
};

describe("exportGpxFile (FR-041)", () => {
  it("shares the file when Web Share supports files", async () => {
    const share = vi.fn<(data: { files?: File[] }) => Promise<void>>(async () => {});
    const download = vi.fn(() => true);
    const outcome = await exportGpxFile(payload, {
      navigator: { share, canShare: () => true },
      download,
    });
    expect(outcome).toBe("share");
    expect(download).not.toHaveBeenCalled();
    const shared = share.mock.calls[0]![0];
    expect(shared.files?.[0]?.name).toBe(payload.fileName);
    expect(shared.files?.[0]?.type).toBe(GPX_EXPORT_MIME_TYPE);
  });

  it("falls back to a classic download when Web Share is absent", async () => {
    const download = vi.fn(() => true);
    const outcome = await exportGpxFile(payload, { navigator: null, download });
    expect(outcome).toBe("download");
    expect(download).toHaveBeenCalledWith(payload);
  });

  it("falls back to a download when the platform refuses to share files", async () => {
    const share = vi.fn<(data: { files?: File[] }) => Promise<void>>(async () => {});
    const download = vi.fn(() => true);
    const outcome = await exportGpxFile(payload, {
      navigator: { share, canShare: () => false },
      download,
    });
    expect(outcome).toBe("download");
    expect(share).not.toHaveBeenCalled();
  });

  it("falls back to a download when the share throws", async () => {
    const download = vi.fn(() => true);
    const outcome = await exportGpxFile(payload, {
      navigator: {
        share: async () => {
          throw new Error("share unavailable");
        },
        canShare: () => true,
      },
      download,
    });
    expect(outcome).toBe("download");
  });

  it("reports a cancelled share without downloading", async () => {
    const download = vi.fn(() => true);
    const abort = Object.assign(new Error("cancelled"), { name: "AbortError" });
    const outcome = await exportGpxFile(payload, {
      navigator: {
        share: async () => {
          throw abort;
        },
        canShare: () => true,
      },
      download,
    });
    expect(outcome).toBe("cancelled");
    expect(download).not.toHaveBeenCalled();
  });

  it("raises a readable error when no export path works", async () => {
    await expect(
      exportGpxFile(payload, { navigator: null, download: () => false }),
    ).rejects.toBeInstanceOf(GpxFileExportError);
  });

  it("raises a readable error when the download throws", async () => {
    await expect(
      exportGpxFile(payload, {
        navigator: null,
        download: () => {
          throw new Error("blob unavailable");
        },
      }),
    ).rejects.toBeInstanceOf(GpxFileExportError);
  });

  it("downloads through an anchor carrying the GPX file name", async () => {
    const createObjectURL = vi.fn(() => "blob:ride");
    const revokeObjectURL = vi.fn();
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
    const clicks: string[] = [];
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicks.push(this.download);
      });
    vi.useFakeTimers();
    try {
      const outcome = await exportGpxFile(payload, { navigator: null });
      expect(outcome).toBe("download");
      expect(clicks).toEqual([payload.fileName]);
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:ride");
      expect(document.querySelector("a[download]")).toBeNull();
    } finally {
      vi.useRealTimers();
      clickSpy.mockRestore();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
});
