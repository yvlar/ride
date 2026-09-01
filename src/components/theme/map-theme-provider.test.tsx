import { act, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAP_THEME_STORAGE_KEY } from "@/domain/map/map-theme";
import { AppearanceProvider, useAppearance } from "./appearance-provider";
import { MapThemeProvider, useMapTheme } from "./map-theme-provider";

function installMatchMedia(matches: boolean) {
  window.matchMedia = () =>
    ({
      matches,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
}

function ThemeProbe() {
  const { theme, setTheme, resolvedTheme } = useMapTheme();
  const { setMode } = useAppearance();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button type="button" onClick={() => setTheme("satellite")}>
        Satellite
      </button>
      <button type="button" onClick={() => setTheme("kart-arcade")}>
        Kart Arcade
      </button>
      <button type="button" onClick={() => setMode("light")}>
        Clair
      </button>
    </div>
  );
}

function renderProbe() {
  return render(
    <StrictMode>
      <AppearanceProvider>
        <MapThemeProvider>
          <ThemeProbe />
        </MapThemeProvider>
      </AppearanceProvider>
    </StrictMode>,
  );
}

describe("MapThemeProvider (FR-045)", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    window.localStorage.clear();
    installMatchMedia(true);
    document.documentElement.classList.remove("dark", "night");
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    window.localStorage.clear();
    document.documentElement.classList.remove("dark", "night");
  });

  it("hydrates the stored theme", async () => {
    window.localStorage.setItem(MAP_THEME_STORAGE_KEY, "kart-arcade");
    renderProbe();

    await waitFor(() => {
      expect(screen.getByTestId("theme")).toHaveTextContent("kart-arcade");
    });
    expect(screen.getByTestId("resolved")).toHaveTextContent("kart-arcade");
  });

  it("persists the Kart Arcade opt-in", async () => {
    renderProbe();

    act(() => {
      screen.getByRole("button", { name: "Kart Arcade" }).click();
    });

    await waitFor(() => {
      expect(window.localStorage.getItem(MAP_THEME_STORAGE_KEY)).toBe(
        "kart-arcade",
      );
    });
  });

  it("persists a new choice", async () => {
    renderProbe();

    act(() => {
      screen.getByRole("button", { name: "Satellite" }).click();
    });

    expect(screen.getByTestId("theme")).toHaveTextContent("satellite");
    await waitFor(() => {
      expect(window.localStorage.getItem(MAP_THEME_STORAGE_KEY)).toBe(
        "satellite",
      );
    });
  });

  it("follows the appearance while automatique (FR-037)", () => {
    renderProbe();

    expect(screen.getByTestId("theme")).toHaveTextContent("auto");
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");

    act(() => {
      screen.getByRole("button", { name: "Clair" }).click();
    });

    expect(screen.getByTestId("resolved")).toHaveTextContent("light");
  });
});
