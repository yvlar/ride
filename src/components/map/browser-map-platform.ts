export type NavigationBrowserPlatform = {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
};

/**
 * MapLibre 5.24 can retain enough WebGL memory to terminate Safari's WebView
 * on iOS (maplibre/maplibre-gl-js#7667). Preview and navigation both skip
 * WebGL on those devices so starting a ride never allocates a GPU context.
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
