export type AppearanceMode = "light" | "dark" | "night" | "system";

/** The appearance actually applied, once `system` has been resolved. */
export type ResolvedAppearance = "light" | "dark" | "night";

export const APPEARANCE_STORAGE_KEY = "ride.appearance.v1";

export function resolveAppearance(
  mode: AppearanceMode,
  prefersDark: boolean,
): ResolvedAppearance {
  if (mode === "system") {
    return prefersDark ? "dark" : "light";
  }
  return mode;
}

export function appearanceClassNames(resolved: ResolvedAppearance): string[] {
  if (resolved === "night") {
    return ["dark", "night"];
  }
  if (resolved === "dark") {
    return ["dark"];
  }
  return [];
}
