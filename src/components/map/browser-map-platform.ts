export type NavigationBrowserPlatform = {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
};

/**
 * MapLibre 5.24 can retain enough WebGL memory to terminate Safari's WebView
 * on iOS (maplibre/maplibre-gl-js#7667). Detection remains available so an
 * explicit lightweight engine can still be opted in; production keeps one
 * shared street-map instance instead of switching to a schematic SVG.
 */
export function prefersLightweightNavigationMap(
  platform: NavigationBrowserPlatform | null,
): boolean {
  if (!platform) {
    return false;
  }
  if (/iPad|iPhone|iPod/i.test(platform.userAgent)) {
    return true;
  }
  return (
    platform.platform === "MacIntel" && (platform.maxTouchPoints ?? 0) > 1
  );
}

export function browserPlatform(): NavigationBrowserPlatform | null {
  if (typeof navigator === "undefined") {
    return null;
  }
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  };
}
