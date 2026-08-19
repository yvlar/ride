import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("defaults to the mock routing provider when env is empty", () => {
    const env = parseEnv({});

    expect(env.ROUTING_PROVIDER).toBe("mock");
    expect(env.ROUTING_API_KEY).toBeUndefined();
    expect(env.NEXT_PUBLIC_MAP_STYLE_URL).toBeUndefined();
  });

  it("treats blank strings as unset values", () => {
    const env = parseEnv({
      ROUTING_PROVIDER: "",
      ROUTING_API_KEY: "",
      NEXT_PUBLIC_MAP_STYLE_URL: "",
    });

    expect(env.ROUTING_PROVIDER).toBe("mock");
    expect(env.ROUTING_API_KEY).toBeUndefined();
    expect(env.NEXT_PUBLIC_MAP_STYLE_URL).toBeUndefined();
  });

  it("rejects an invalid public map style URL", () => {
    expect(() =>
      parseEnv({
        NEXT_PUBLIC_MAP_STYLE_URL: "not-a-url",
      }),
    ).toThrow();
  });
});
