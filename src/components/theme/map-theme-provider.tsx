"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_MAP_THEME,
  isMapTheme,
  MAP_THEME_STORAGE_KEY,
  resolveMapTheme,
  type MapTheme,
  type ResolvedMapTheme,
} from "@/domain/map/map-theme";
import { useAppearance } from "./appearance-provider";

const MapThemeContext = createContext<{
  theme: MapTheme;
  setTheme: (theme: MapTheme) => void;
  resolvedTheme: ResolvedMapTheme;
  /**
   * FR-046 — the map calls this when a basemap could not be loaded. The rider
   * is returned to the default theme instead of being left on a setting that
   * never applies, and the failed theme is not retried this session.
   */
  reportThemeFailure: () => void;
}>({
  theme: DEFAULT_MAP_THEME,
  setTheme: () => {},
  resolvedTheme: "dark",
  reportThemeFailure: () => {},
});

/**
 * FR-045 — the basemap chosen in Réglages. Hydrated from `localStorage` after
 * mount, like the appearance, so the server and the first client render agree.
 */
export function MapThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<MapTheme>(DEFAULT_MAP_THEME);
  const [hydrated, setHydrated] = useState(false);
  const { resolved } = useAppearance();

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage hydrate */
    try {
      const stored = window.localStorage.getItem(MAP_THEME_STORAGE_KEY);
      if (isMapTheme(stored)) {
        setTheme(stored);
      }
    } catch {
      // Private mode.
    }
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    try {
      window.localStorage.setItem(MAP_THEME_STORAGE_KEY, theme);
    } catch {
      // Private mode.
    }
  }, [hydrated, theme]);

  const themeRef = useRef(theme);
  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  const reportThemeFailure = useCallback(() => {
    if (themeRef.current === DEFAULT_MAP_THEME) {
      return;
    }
    setTheme(DEFAULT_MAP_THEME);
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      resolvedTheme: resolveMapTheme(theme, resolved),
      reportThemeFailure,
    }),
    [theme, resolved, reportThemeFailure],
  );

  return (
    <MapThemeContext.Provider value={value}>
      {children}
    </MapThemeContext.Provider>
  );
}

export function useMapTheme() {
  return useContext(MapThemeContext);
}
