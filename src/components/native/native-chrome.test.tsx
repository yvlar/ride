import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const isNativePlatform = vi.fn(() => false);
const setStyle = vi.fn().mockResolvedValue(undefined);
const hide = vi.fn().mockResolvedValue(undefined);

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => isNativePlatform() },
}));

vi.mock("@capacitor/status-bar", () => ({
  Style: { Light: "LIGHT" },
  StatusBar: { setStyle: (options: unknown) => setStyle(options) },
}));

vi.mock("@capacitor/splash-screen", () => ({
  SplashScreen: { hide: () => hide() },
}));

describe("NativeChrome (FR-027)", () => {
  it("does nothing in the browser", async () => {
    isNativePlatform.mockReturnValue(false);
    const { NativeChrome } = await import("./native-chrome");
    render(<NativeChrome />);
    expect(setStyle).not.toHaveBeenCalled();
    expect(hide).not.toHaveBeenCalled();
  });

  it("applies the status bar and hides the splash on the iOS shell", async () => {
    isNativePlatform.mockReturnValue(true);
    vi.resetModules();
    const { NativeChrome } = await import("./native-chrome");
    render(<NativeChrome />);
    await vi.waitFor(() => {
      expect(setStyle).toHaveBeenCalledWith({ style: "LIGHT" });
      expect(hide).toHaveBeenCalled();
    });
  });
});
