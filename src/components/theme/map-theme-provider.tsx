"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
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
}>({
  theme: DEFAULT_MAP_THEME,
  setTheme: () => {},
  resolvedTheme: "dark",
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

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      resolvedTheme: resolveMapTheme(theme, resolved),
    }),
    [theme, resolved],
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
