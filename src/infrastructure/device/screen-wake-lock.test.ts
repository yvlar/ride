import { describe, expect, it, vi } from "vitest";
import {
  createForegroundScreenWakeLock,
  createPluginScreenWakeLock,
} from "./screen-wake-lock";

describe("createForegroundScreenWakeLock (FR-023, FR-027)", () => {
  it("is a no-op on the web so Safari is unchanged (NFR-007)", () => {
    const plugin = {
      keepAwake: vi.fn(async () => {}),
      allowSleep: vi.fn(async () => {}),
    };
    const lock = createForegroundScreenWakeLock({
      isNative: false,
      plugin,
    });
    lock.acquire();
    lock.release();
    expect(plugin.keepAwake).not.toHaveBeenCalled();
    expect(plugin.allowSleep).not.toHaveBeenCalled();
  });

  it("holds the screen only while navigation is running on iOS", async () => {
    const plugin = {
      keepAwake: vi.fn(async () => {}),
      allowSleep: vi.fn(async () => {}),
    };
    const lock = createPluginScreenWakeLock(plugin);
    lock.acquire();
    lock.acquire();
    await vi.waitFor(() => {
      expect(plugin.keepAwake).toHaveBeenCalledTimes(1);
    });
    lock.release();
    await vi.waitFor(() => {
      expect(plugin.allowSleep).toHaveBeenCalledTimes(1);
    });
  });

  it("uses the plugin when the iOS shell is detected", async () => {
    const plugin = {
      keepAwake: vi.fn(async () => {}),
      allowSleep: vi.fn(async () => {}),
    };
    const lock = createForegroundScreenWakeLock({ isNative: true, plugin });
    lock.acquire();
    await vi.waitFor(() => {
      expect(plugin.keepAwake).toHaveBeenCalledTimes(1);
    });
  });
});
