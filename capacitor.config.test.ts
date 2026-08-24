import { describe, expect, it } from "vitest";
import { createCapacitorConfig } from "./capacitor.config";

describe("createCapacitorConfig (FR-027)", () => {
  it("identifies the iOS shell without a baked-in remote origin", () => {
    const config = createCapacitorConfig({});

    expect(config.appId).toBe("app.ride.ios");
    expect(config.appName).toBe("Ride");
    expect(config.webDir).toBe("public");
    expect(config.server).toBeUndefined();
    expect(config.ios).toMatchObject({ contentInset: "never" });
  });

  it("loads the Next.js origin only when CAPACITOR_SERVER_URL is set", () => {
    const https = createCapacitorConfig({
      CAPACITOR_SERVER_URL: "https://ride.example",
    });
    expect(https.server).toEqual({
      url: "https://ride.example",
      cleartext: false,
    });

    const local = createCapacitorConfig({
      CAPACITOR_SERVER_URL: "http://192.168.1.10:3000",
    });
    expect(local.server).toEqual({
      url: "http://192.168.1.10:3000",
      cleartext: true,
    });
  });
});
