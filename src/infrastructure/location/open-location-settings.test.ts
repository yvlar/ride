import { describe, expect, it, vi } from "vitest";
import { openDeviceLocationSettings } from "./open-location-settings";

describe("openDeviceLocationSettings (FR-038)", () => {
  it("opens app settings on a native host", () => {
    const assign = vi.fn();
    expect(openDeviceLocationSettings({ isNative: true, assign })).toBe(true);
    expect(assign).toHaveBeenCalledWith("app-settings:");
  });

  it("does not invent a browser settings URL", () => {
    const assign = vi.fn();
    expect(openDeviceLocationSettings({ isNative: false, assign })).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });
});
