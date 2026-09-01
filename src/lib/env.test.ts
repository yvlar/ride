import { describe, expect, it } from "vitest";
import { parseEnv, serverProcessEnv } from "./env";

describe("parseEnv", () => {
  it("defaults to the mock routing provider when env is empty", () => {
    const env = parseEnv({});

    expect(env.ROUTING_PROVIDER).toBe("mock");
    // Geocoding is keyless, so the default is a search that actually works.
    expect(env.GEOCODING_PROVIDER).toBe("photon");
    expect(env.ROUTING_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_BASE_URL).toBeUndefined();
    expect(env.OPENAI_MODEL).toBeUndefined();
    expect(env.WEB_SEARCH_API_KEY).toBeUndefined();
    expect(env.NEXT_PUBLIC_MAP_STYLE_URL).toBeUndefined();
  });

  it("accepts the mock, Photon and Nominatim geocoding providers (NFR-005)", () => {
    expect(parseEnv({ GEOCODING_PROVIDER: "mock" }).GEOCODING_PROVIDER).toBe(
      "mock",
    );
    expect(parseEnv({ GEOCODING_PROVIDER: "photon" }).GEOCODING_PROVIDER).toBe(
      "photon",
    );
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

  it("accepts a Tavily, Brave or OpenAI web search provider (FR-034)", () => {
    expect(
      parseEnv({
        WEB_SEARCH_PROVIDER: "brave",
        WEB_SEARCH_API_KEY: "test-web-search-key",
      }).WEB_SEARCH_PROVIDER,
    ).toBe("brave");
    expect(
      parseEnv({
        WEB_SEARCH_PROVIDER: "tavily",
        WEB_SEARCH_API_KEY: "test-web-search-key",
      }).WEB_SEARCH_PROVIDER,
    ).toBe("tavily");
    expect(
      parseEnv({
        WEB_SEARCH_PROVIDER: "openai",
        OPENAI_API_KEY: "test-openai-key",
      }).WEB_SEARCH_PROVIDER,
    ).toBe("openai");
  });

  it("treats blank strings as unset values", () => {
    const env = parseEnv({
      ROUTING_PROVIDER: "",
      ROUTING_API_KEY: "",
      OPENAI_API_KEY: "",
      WEB_SEARCH_API_KEY: "",
      NEXT_PUBLIC_MAP_STYLE_URL: "",
    });

    expect(env.ROUTING_PROVIDER).toBe("mock");
    expect(env.ROUTING_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.WEB_SEARCH_API_KEY).toBeUndefined();
    expect(env.NEXT_PUBLIC_MAP_STYLE_URL).toBeUndefined();
  });

  it("reads OPENAI_API_KEY through a static process.env access (FR-029)", () => {
    const fromProcess = serverProcessEnv();
    expect(fromProcess).toHaveProperty("OPENAI_API_KEY");
    expect(fromProcess).toHaveProperty("WEB_SEARCH_API_KEY");
    expect(parseEnv().OPENAI_API_KEY).toBe(process.env.OPENAI_API_KEY);
  });

  it("accepts a server-only Supabase read configuration (FR-040)", () => {
    const env = parseEnv({
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_ANON_KEY: "test-anon-key",
    });

    expect(env.SUPABASE_URL).toBe("https://project.supabase.co");
    expect(env.SUPABASE_ANON_KEY).toBe("test-anon-key");
    expect(parseEnv({}).SUPABASE_URL).toBeUndefined();
    expect(parseEnv({}).SUPABASE_ANON_KEY).toBeUndefined();
  });

  it("never exposes a Supabase key through NEXT_PUBLIC_ (FR-040)", () => {
    const publicKeys = Object.keys(serverProcessEnv()).filter((key) =>
      key.startsWith("NEXT_PUBLIC_"),
    );

    expect(publicKeys).toEqual(["NEXT_PUBLIC_MAP_STYLE_URL"]);
  });

  it("rejects an invalid public map style URL", () => {
    expect(() =>
      parseEnv({
        NEXT_PUBLIC_MAP_STYLE_URL: "not-a-url",
      }),
    ).toThrow();
  });

  it("defaults weather and radar to their keyless public providers (FR-043)", () => {
    const env = parseEnv({});

    expect(env.WEATHER_PROVIDER).toBe("open-meteo");
    expect(env.RADAR_PROVIDER).toBe("rainviewer");
    expect(env.WEATHER_API_BASE_URL).toBeUndefined();
    expect(env.WEATHER_API_KEY).toBeUndefined();
    expect(env.RADAR_API_BASE_URL).toBeUndefined();
    expect(env.RADAR_API_KEY).toBeUndefined();
  });

  it("accepts the Canadian radar service (FR-043)", () => {
    expect(parseEnv({ RADAR_PROVIDER: "geomet" }).RADAR_PROVIDER).toBe(
      "geomet",
    );
  });

  it("accepts offline weather and radar providers (FR-043)", () => {
    const env = parseEnv({ WEATHER_PROVIDER: "mock", RADAR_PROVIDER: "mock" });

    expect(env.WEATHER_PROVIDER).toBe("mock");
    expect(env.RADAR_PROVIDER).toBe("mock");
  });

  it("reads the weather configuration through static process.env access (FR-043)", () => {
    const fromProcess = serverProcessEnv();

    expect(fromProcess).toHaveProperty("WEATHER_PROVIDER");
    expect(fromProcess).toHaveProperty("WEATHER_API_BASE_URL");
    expect(fromProcess).toHaveProperty("WEATHER_API_KEY");
    expect(fromProcess).toHaveProperty("RADAR_PROVIDER");
    expect(fromProcess).toHaveProperty("RADAR_API_BASE_URL");
    expect(fromProcess).toHaveProperty("RADAR_API_KEY");
  });
});
