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
  const { theme, setTheme, resolvedTheme, reportThemeFailure } = useMapTheme();
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
      <button type="button" onClick={reportThemeFailure}>
        Échec du fond
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
    delete document.documentElement.dataset.mapTheme;
  });

  it("publishes the resolved basemap on the document (FR-046)", async () => {
    // The arcade skin outside the map is pure CSS hanging off this attribute,
    // so it is the whole contract between the provider and the interface.
    renderProbe();

    act(() => {
      screen.getByRole("button", { name: "Kart Arcade" }).click();
    });

    await waitFor(() => {
      expect(document.documentElement.dataset.mapTheme).toBe("kart-arcade");
    });

    act(() => {
      screen.getByRole("button", { name: "Satellite" }).click();
    });

    await waitFor(() => {
      expect(document.documentElement.dataset.mapTheme).toBe("satellite");
    });
  });

  it("takes the theme off the document when it unmounts (FR-046)", async () => {
    const view = renderProbe();

    act(() => {
      screen.getByRole("button", { name: "Kart Arcade" }).click();
    });
    await waitFor(() => {
      expect(document.documentElement.dataset.mapTheme).toBe("kart-arcade");
    });

    view.unmount();

    expect(document.documentElement.dataset.mapTheme).toBeUndefined();
  });

  it("hydrates the stored theme", async () => {
    window.localStorage.setItem(MAP_THEME_STORAGE_KEY, "terrain");
    renderProbe();

    await waitFor(() => {
      expect(screen.getByTestId("theme")).toHaveTextContent("terrain");
    });
    expect(screen.getByTestId("resolved")).toHaveTextContent("terrain");
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

  it("restores Kart Arcade after a restart (FR-046)", async () => {
    window.localStorage.setItem(MAP_THEME_STORAGE_KEY, "kart-arcade");
    renderProbe();

    await waitFor(() => {
      expect(screen.getByTestId("theme")).toHaveTextContent("kart-arcade");
    });
    // Unlike Automatique, the arcade theme does not follow the appearance.
    expect(screen.getByTestId("resolved")).toHaveTextContent("kart-arcade");
  });

  it("falls back to the default theme when a basemap cannot load (FR-046)", async () => {
    renderProbe();

    act(() => {
      screen.getByRole("button", { name: "Kart Arcade" }).click();
    });
    await waitFor(() => {
      expect(window.localStorage.getItem(MAP_THEME_STORAGE_KEY)).toBe(
        "kart-arcade",
      );
    });

    act(() => {
      screen.getByRole("button", { name: "Échec du fond" }).click();
    });

    expect(screen.getByTestId("theme")).toHaveTextContent("auto");
    await waitFor(() => {
      expect(window.localStorage.getItem(MAP_THEME_STORAGE_KEY)).toBe("auto");
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
