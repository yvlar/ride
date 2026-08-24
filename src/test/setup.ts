import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { installChatCompletionsTestStub } from "./stub-chat-completions";

process.env.ROUTING_PROVIDER = "mock";
process.env.GEOCODING_PROVIDER = "mock";
process.env.GEOCODING_API_BASE_URL = "";
process.env.GEOCODING_API_KEY = "";
process.env.OPENAI_API_KEY = "test-openai-key";

installChatCompletionsTestStub();

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
});


