import { describe, expect, it } from "vitest";
import { createWebSearchProvider } from "./create-web-search-provider";
import { HttpWebSearchProvider } from "./http-web-search-provider";
import { OpenAiWebSearchProvider } from "./openai-web-search-provider";
import { WebSearchError } from "./web-search-error";

describe("createWebSearchProvider (FR-034)", () => {
  it("requires a server-only search or chat key", () => {
    expect(() => createWebSearchProvider({ WEB_SEARCH_API_KEY: "" })).toThrow(
      WebSearchError,
    );
  });

  it("builds the HTTP adapter when a dedicated search key is present", () => {
    const provider = createWebSearchProvider({
      WEB_SEARCH_API_KEY: "test-web-search-key",
      WEB_SEARCH_PROVIDER: "tavily",
    });
    expect(provider).toBeInstanceOf(HttpWebSearchProvider);
  });

  it("uses the server chat key when no dedicated search key is set", () => {
    const provider = createWebSearchProvider({
      OPENAI_API_KEY: "test-openai-key",
    });
    expect(provider).toBeInstanceOf(OpenAiWebSearchProvider);
  });

  it("uses the server chat key when WEB_SEARCH_PROVIDER is openai", () => {
    const provider = createWebSearchProvider({
      OPENAI_API_KEY: "vck_test_key",
      WEB_SEARCH_PROVIDER: "openai",
      WEB_SEARCH_API_KEY: "test-web-search-key",
    });
    expect(provider).toBeInstanceOf(OpenAiWebSearchProvider);
  });
});
