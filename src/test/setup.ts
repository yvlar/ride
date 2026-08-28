import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { installChatCompletionsTestStub } from "./stub-chat-completions";

process.env.ROUTING_PROVIDER = "mock";
process.env.GEOCODING_PROVIDER = "mock";
process.env.GEOCODING_API_BASE_URL = "";
process.env.GEOCODING_API_KEY = "";
process.env.OPENAI_API_KEY = "test-openai-key";
process.env.WEB_SEARCH_API_KEY = "test-web-search-key";
process.env.WEB_SEARCH_PROVIDER = "tavily";
// La base de codes postaux (FR-040) reste débranchée par défaut dans les tests.
process.env.SUPABASE_URL = "";
process.env.SUPABASE_ANON_KEY = "";

installChatCompletionsTestStub();

beforeEach(() => {
  installChatCompletionsTestStub();
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = ResizeObserverStub;
}

afterEach(() => {
  cleanup();
  installChatCompletionsTestStub();
});


