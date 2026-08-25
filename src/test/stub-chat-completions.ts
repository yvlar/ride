import { offsetCoordinates } from "@/domain/geo/distance";
import { AI_RIDE_PLAN_QUERY_HEADER } from "@/infrastructure/ai/http-ai-ride-planner";
import {
  CHAT_RANKING_KINDS_HEADER,
  CHAT_RANKING_QUERY_HEADER,
} from "@/infrastructure/routing/rag/chatgpt-corridor-retriever";
import { lexicalScore, tokenize } from "@/infrastructure/routing/rag/retrieve";
import { stubWebSearchResponse } from "./stub-web-search";

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

  if (userContent.includes(AI_RIDE_PLAN_QUERY_HEADER)) {
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(planFromDescribePrompt(userContent)),
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

function planFromDescribePrompt(userContent: string): {
  viaPoints: { latitude: number; longitude: number }[];
  roads: string[];
  pointsOfInterest: string[];
} {
  const start = userContent.indexOf("{");
  const payload = JSON.parse(userContent.slice(start)) as {
    origin?: { latitude?: number; longitude?: number };
    targetDistanceKm?: number;
    previousRouteSignature?: string | null;
  };
  const origin = {
    latitude: payload.origin?.latitude ?? 45.4,
    longitude: payload.origin?.longitude ?? -72.73,
  };
  const radiusKm = Math.max(8, (payload.targetDistanceKm ?? 100) / 8);
  const offset = payload.previousRouteSignature ? 40 : 0;
  return {
    viaPoints: [0, 90, 180, 270].map((bearing) =>
      offsetCoordinates(origin, bearing + offset, radiusKm),
    ),
    roads: ["Chemin des crêtes"],
    pointsOfInterest: ["Belvédère"],
  };
}

const RIDE_TEST_FETCH_STUB = "__rideTestFetchStub";

export function installChatCompletionsTestStub(): void {
  const current = globalThis.fetch as typeof fetch & {
    [RIDE_TEST_FETCH_STUB]?: boolean;
  };
  if (current[RIDE_TEST_FETCH_STUB]) {
    return;
  }
  const originalFetch = globalThis.fetch.bind(globalThis);
  const stubbed = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response =
      stubWebSearchResponse(input) ?? stubChatCompletionsResponse(input, init);
    if (response) {
      return response;
    }
    return originalFetch(input, init);
  }) as typeof fetch & { [RIDE_TEST_FETCH_STUB]?: boolean };
  stubbed[RIDE_TEST_FETCH_STUB] = true;
  globalThis.fetch = stubbed;
}
