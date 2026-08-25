import { describe, expect, it } from "vitest";
import { createWebSearchProvider } from "./create-web-search-provider";
import { HttpWebSearchProvider } from "./http-web-search-provider";
import { WebSearchError } from "./web-search-error";

describe("createWebSearchProvider (FR-034)", () => {
  it("requires a server-only search key", () => {
    expect(() => createWebSearchProvider({ WEB_SEARCH_API_KEY: "" })).toThrow(
      WebSearchError,
    );
  });

  it("builds the HTTP adapter when a key is present", () => {
    const provider = createWebSearchProvider({
      WEB_SEARCH_API_KEY: "test-web-search-key",
      WEB_SEARCH_PROVIDER: "tavily",
    });
    expect(provider).toBeInstanceOf(HttpWebSearchProvider);
  });
});
