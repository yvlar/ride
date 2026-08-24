import { describe, expect, it } from "vitest";
import { parseEnv, serverProcessEnv } from "./env";

describe("parseEnv", () => {
  it("defaults to the mock routing provider when env is empty", () => {
    const env = parseEnv({});

    expect(env.ROUTING_PROVIDER).toBe("mock");
    expect(env.GEOCODING_PROVIDER).toBe("mock");
    expect(env.ROUTING_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_BASE_URL).toBeUndefined();
    expect(env.OPENAI_MODEL).toBeUndefined();
    expect(env.NEXT_PUBLIC_MAP_STYLE_URL).toBeUndefined();
  });

  it("accepts a Nominatim geocoding provider (NFR-005)", () => {
    expect(
      parseEnv({ GEOCODING_PROVIDER: "nominatim" }).GEOCODING_PROVIDER,
    ).toBe("nominatim");
  });

  it("accepts mock, ai-rag and OSRM routing providers (NFR-005)", () => {
    expect(parseEnv({ ROUTING_PROVIDER: "mock" }).ROUTING_PROVIDER).toBe("mock");
    expect(parseEnv({ ROUTING_PROVIDER: "ai-rag" }).ROUTING_PROVIDER).toBe(
      "ai-rag",
    );
    expect(parseEnv({ ROUTING_PROVIDER: "osrm" }).ROUTING_PROVIDER).toBe(
      "osrm",
    );
  });

  it("accepts a server-only ChatGPT key for knowledge routing (FR-029)", () => {
    const env = parseEnv({
      OPENAI_API_KEY: "test-openai-key",
      OPENAI_API_BASE_URL: "https://api.openai.com/v1",
      OPENAI_MODEL: "gpt-4o-mini",
    });

    expect(env.OPENAI_API_KEY).toBe("test-openai-key");
    expect(env.OPENAI_API_BASE_URL).toBe("https://api.openai.com/v1");
    expect(env.OPENAI_MODEL).toBe("gpt-4o-mini");
  });

  it("treats blank strings as unset values", () => {
    const env = parseEnv({
      ROUTING_PROVIDER: "",
      ROUTING_API_KEY: "",
      OPENAI_API_KEY: "",
      NEXT_PUBLIC_MAP_STYLE_URL: "",
    });

    expect(env.ROUTING_PROVIDER).toBe("mock");
    expect(env.ROUTING_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.NEXT_PUBLIC_MAP_STYLE_URL).toBeUndefined();
  });

  it("reads OPENAI_API_KEY through a static process.env access (FR-029)", () => {
    const fromProcess = serverProcessEnv();
    expect(fromProcess).toHaveProperty("OPENAI_API_KEY");
    expect(parseEnv().OPENAI_API_KEY).toBe(process.env.OPENAI_API_KEY);
  });

  it("rejects an invalid public map style URL", () => {
    expect(() =>
      parseEnv({
        NEXT_PUBLIC_MAP_STYLE_URL: "not-a-url",
      }),
    ).toThrow();
  });
});
