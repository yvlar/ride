import { describe, expect, it } from "vitest";
import { metadata, viewport } from "./document-chrome";

describe("root layout chrome (FR-027, NFR-001)", () => {
  it("covers the iPhone safe area and uses a dark status bar theme", () => {
    expect(viewport.viewportFit).toBe("cover");
    expect(viewport.themeColor).toBe("#252525");
    expect(metadata.appleWebApp).toMatchObject({
      capable: true,
      title: "Ride",
      statusBarStyle: "black-translucent",
    });
  });
});
