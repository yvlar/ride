import {
  CHAT_RANKING_KINDS_HEADER,
  CHAT_RANKING_QUERY_HEADER,
} from "@/infrastructure/routing/rag/chatgpt-corridor-retriever";
import { lexicalScore, tokenize } from "@/infrastructure/routing/rag/retrieve";

type KindPayload = {
  key: string;
  text?: string;
};

export function rankKindsFromChatPrompt(
  userContent: string,
): { key: string; score: number }[] {
  const queryIndex = userContent.indexOf(CHAT_RANKING_QUERY_HEADER);
  const kindsIndex = userContent.indexOf(CHAT_RANKING_KINDS_HEADER);
  if (queryIndex < 0 || kindsIndex < 0 || kindsIndex <= queryIndex) {
    return [];
  }

  const query = userContent
    .slice(queryIndex + CHAT_RANKING_QUERY_HEADER.length, kindsIndex)
    .trim();
  const kindsJson = userContent
    .slice(kindsIndex + CHAT_RANKING_KINDS_HEADER.length)
    .trim();
  const kinds = JSON.parse(kindsJson) as KindPayload[];
  const queryTokens = tokenize(query);
  return kinds.map((kind) => ({
    key: kind.key,
    score: lexicalScore(queryTokens, kind.text ?? ""),
  }));
}

export function stubChatCompletionsResponse(
  input: RequestInfo | URL,
  init?: RequestInit,
): Response | undefined {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (!url.includes("/chat/completions")) {
    return undefined;
  }

  const body = typeof init?.body === "string" ? init.body : "";
  const payload = JSON.parse(body || "{}") as {
    messages?: { role?: string; content?: string }[];
  };
  const userContent =
    payload.messages?.find((message) => message.role === "user")?.content ?? "";
  const ranked = rankKindsFromChatPrompt(userContent);

  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({ ranked }),
          },
        },
      ],
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}

export function installChatCompletionsTestStub(): void {
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const stubbed = stubChatCompletionsResponse(input, init);
    if (stubbed) {
      return stubbed;
    }
    return originalFetch(input, init);
  }) as typeof fetch;
}
