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
  APPEARANCE_STORAGE_KEY,
  appearanceClassNames,
  resolveAppearance,
  type AppearanceMode,
} from "@/domain/appearance/appearance";

const AppearanceContext = createContext<{
  mode: AppearanceMode;
  setMode: (mode: AppearanceMode) => void;
}>({
  mode: "dark",
  setMode: () => {},
});

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AppearanceMode>("dark");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
      if (
        stored === "light" ||
        stored === "dark" ||
        stored === "night" ||
        stored === "system"
      ) {
        /* eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage hydrate */
        setMode(stored);
      }
    } catch {
      // Private mode.
    }
  }, []);

  const prefersDark = useMemo(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return true;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }, []);

  useEffect(() => {
    const resolved = resolveAppearance(mode, prefersDark);
    const root = document.documentElement;
    root.classList.remove("dark", "night");
    for (const className of appearanceClassNames(resolved)) {
      root.classList.add(className);
    }
    try {
      window.localStorage.setItem(APPEARANCE_STORAGE_KEY, mode);
    } catch {
      // Ignore.
    }
  }, [mode, prefersDark]);

  return (
    <AppearanceContext.Provider value={{ mode, setMode }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  return useContext(AppearanceContext);
}
