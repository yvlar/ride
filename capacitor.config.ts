import type { CapacitorConfig } from "@capacitor/cli";

export function createCapacitorConfig(
  env: Record<string, string | undefined> = process.env,
): CapacitorConfig {
  const serverUrl = env.CAPACITOR_SERVER_URL?.trim();

  const config: CapacitorConfig = {
    appId: "app.ride.ios",
    appName: "Ride",
    webDir: "public",
    ios: {
      // CSS env(safe-area-inset-*) owns the notch; automatic insets would double-count.
      contentInset: "never",
      scheme: "Ride",
    },
    plugins: {
      SplashScreen: {
        launchAutoHide: true,
        backgroundColor: "#17324D",
        showSpinner: false,
      },
      StatusBar: {
        style: "LIGHT",
        backgroundColor: "#17324D",
      },
      Keyboard: {
        resizeOnFullScreen: true,
      },
    },
  };

  if (serverUrl) {
    config.server = {
      url: serverUrl,
      cleartext: serverUrl.startsWith("http://"),
    };
  }

  return config;
}

const config = createCapacitorConfig();

export default config;
