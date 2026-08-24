export type AppearanceMode = "light" | "dark" | "night" | "system";

export const APPEARANCE_STORAGE_KEY = "ride.appearance.v1";

export function resolveAppearance(
  mode: AppearanceMode,
  prefersDark: boolean,
): "light" | "dark" | "night" {
  if (mode === "system") {
    return prefersDark ? "dark" : "light";
  }
  return mode;
}

export function appearanceClassNames(
  resolved: "light" | "dark" | "night",
): string[] {
  if (resolved === "night") {
    return ["dark", "night"];
  }
  if (resolved === "dark") {
    return ["dark"];
  }
  return [];
}
