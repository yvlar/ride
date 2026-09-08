"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

/**
 * Status bar + splash for the iOS shell. No-op on the web (FR-027, NFR-007).
 */
export function NativeChrome() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    void StatusBar.setStyle({ style: Style.Light }).catch(() => {});
    void SplashScreen.hide().catch(() => {});
  }, []);
  return null;
}
