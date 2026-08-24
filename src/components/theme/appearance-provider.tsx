"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
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

const PREFERS_DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribePrefersDark(onStoreChange: () => void) {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return () => {};
  }
  const media = window.matchMedia(PREFERS_DARK_QUERY);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function getPrefersDarkSnapshot() {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return true;
  }
  return window.matchMedia(PREFERS_DARK_QUERY).matches;
}

function getPrefersDarkServerSnapshot() {
  return true;
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AppearanceMode>("dark");
  const [hydrated, setHydrated] = useState(false);
  const prefersDark = useSyncExternalStore(
    subscribePrefersDark,
    getPrefersDarkSnapshot,
    getPrefersDarkServerSnapshot,
  );

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage hydrate */
    try {
      const stored = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
      if (
        stored === "light" ||
        stored === "dark" ||
        stored === "night" ||
        stored === "system"
      ) {
        setMode(stored);
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
  }, [hydrated, mode, prefersDark]);

  return (
    <AppearanceContext.Provider value={{ mode, setMode }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  return useContext(AppearanceContext);
}
