import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("defaults to the RAG routing provider when env is empty (NFR-005)", () => {
    const env = parseEnv({});

    expect(env.ROUTING_PROVIDER).toBe("ai-rag");
    expect(env.ROUTING_API_KEY).toBeUndefined();
    expect(env.NEXT_PUBLIC_MAP_STYLE_URL).toBeUndefined();
  });

  it("accepts mock and ai-rag routing providers (NFR-005)", () => {
    expect(parseEnv({ ROUTING_PROVIDER: "mock" }).ROUTING_PROVIDER).toBe("mock");
    expect(parseEnv({ ROUTING_PROVIDER: "ai-rag" }).ROUTING_PROVIDER).toBe(
      "ai-rag",
    );
  });

  it("treats blank strings as unset values", () => {
    const env = parseEnv({
      ROUTING_PROVIDER: "",
      ROUTING_API_KEY: "",
      NEXT_PUBLIC_MAP_STYLE_URL: "",
    });

    expect(env.ROUTING_PROVIDER).toBe("ai-rag");
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
