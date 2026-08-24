import { describe, expect, it, vi } from "vitest";
import { offsetCoordinates } from "@/domain/geo/distance";
import type { Coordinates } from "@/domain/geo/types";
import {
  buildChatRankingUserMessage,
  ChatGptCorridorRetriever,
  corridorKindKey,
  parseJsonObjectContent,
  uniqueCorridorKinds,
} from "./chatgpt-corridor-retriever";
import type { ChatCompletionsClient } from "./chat-completions-client";
import { buildLocalRoadIndex } from "./local-road-index";
import type { RouteKnowledgeDocument } from "./types";

const GRANBY: Coordinates = { latitude: 45.403, longitude: -72.734 };

function fakeClient(
  complete: ChatCompletionsClient["complete"],
): ChatCompletionsClient {
  return { complete };
}

describe("ChatGptCorridorRetriever (FR-029, NFR-005)", () => {
  it("keeps every spatially relevant corridor and applies ChatGPT kind scores", async () => {
    const destination = offsetCoordinates(GRANBY, 90, 4);
    const documents = buildLocalRoadIndex(GRANBY, [GRANBY, destination]);
    const kinds = uniqueCorridorKinds(documents);
    const complete = vi.fn<ChatCompletionsClient["complete"]>(async () =>
      JSON.stringify({
        ranked: kinds.map((kind) => ({
          key: kind.key,
          score: kind.roadName === "Rang panoramique" ? 1 : 0.2,
        })),
      }),
    );
    const retriever = new ChatGptCorridorRetriever({
      client: fakeClient(complete),
    });

    const retrieved = await retriever.retrieve({
      query: "boucle moto scenic panoramique",
      documents,
      stops: [GRANBY, destination],
    });

    expect(retrieved.length).toBe(documents.length);
    const scenic = retrieved.filter(
      (entry) => entry.document.roadName === "Rang panoramique",
    );
    const touring = retrieved.filter(
      (entry) => entry.document.roadName === "Route de traverse",
    );
    expect(scenic.length).toBeGreaterThan(0);
    expect(touring.length).toBeGreaterThan(0);
    expect(scenic[0]?.score).toBe(1);
    expect(touring[0]?.score).toBe(0.2);
    expect(complete).toHaveBeenCalledTimes(1);
    const request = complete.mock.calls[0]?.[0];
    const userContent = request?.messages.find(
      (message) => message.role === "user",
    )?.content;
    expect(userContent).toContain("QUERY:");
    expect(userContent).not.toMatch(/latitude|longitude/i);
  });

  it("ignores unknown keys and clamps scores", async () => {
    const destination = offsetCoordinates(GRANBY, 90, 4);
    const documents = buildLocalRoadIndex(GRANBY, [GRANBY, destination]);
    const retriever = new ChatGptCorridorRetriever({
      client: fakeClient(async () =>
        JSON.stringify({
          ranked: [
            { key: "invented-road", score: 9 },
            {
              key: corridorKindKey(documents[0] as RouteKnowledgeDocument),
              score: 4,
            },
          ],
        }),
      ),
    });

    const retrieved = await retriever.retrieve({
      query: "touring",
      documents,
      stops: [GRANBY, destination],
    });

    expect(retrieved.some((entry) => entry.document.id === "invented-road")).toBe(
      false,
    );
    expect(
      retrieved.find((entry) => entry.document.id === documents[0]?.id)?.score,
    ).toBe(1);
  });

  it("does not call ChatGPT when no corridor is spatially relevant", async () => {
    const complete = vi.fn<ChatCompletionsClient["complete"]>(async () => {
      throw new Error("should not be called");
    });
    const retriever = new ChatGptCorridorRetriever({
      client: fakeClient(complete),
    });
    const far: RouteKnowledgeDocument = {
      id: "grid:0,0|1,0",
      text: "scenic",
      roadName: "Équateur",
      roadClass: "secondary",
      surface: "paved",
      fromCell: { x: 0, y: 0 },
      toCell: { x: 1, y: 0 },
      from: { latitude: 0, longitude: 0 },
      to: { latitude: 0, longitude: 0.02 },
      midpoint: { latitude: 0, longitude: 0.01 },
    };

    const retrieved = await retriever.retrieve({
      query: "scenic",
      documents: [far],
      stops: [GRANBY, offsetCoordinates(GRANBY, 90, 4)],
    });

    expect(retrieved).toEqual([]);
    expect(complete).not.toHaveBeenCalled();
  });

  it("coalesces parallel ranking requests for the same query", async () => {
    let resolveComplete: ((value: string) => void) | undefined;
    const complete = vi.fn<ChatCompletionsClient["complete"]>(
      () =>
        new Promise<string>((resolve) => {
          resolveComplete = resolve;
        }),
    );
    const retriever = new ChatGptCorridorRetriever({
      client: fakeClient(complete),
    });
    const destination = offsetCoordinates(GRANBY, 90, 4);
    const documents = buildLocalRoadIndex(GRANBY, [GRANBY, destination]);
    const input = {
      query: "boucle touring",
      documents,
      stops: [GRANBY, destination],
    };

    const first = retriever.retrieve(input);
    const second = retriever.retrieve(input);
    expect(complete).toHaveBeenCalledTimes(1);
    resolveComplete?.(JSON.stringify({ ranked: [] }));
    await Promise.all([first, second]);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid model payload", async () => {
    const retriever = new ChatGptCorridorRetriever({
      client: fakeClient(async () => "not-json"),
    });
    const destination = offsetCoordinates(GRANBY, 90, 4);

    await expect(
      retriever.retrieve({
        query: "touring",
        documents: buildLocalRoadIndex(GRANBY, [GRANBY, destination]),
        stops: [GRANBY, destination],
      }),
    ).rejects.toThrow(/invalide/);
  });
});

describe("chat ranking helpers", () => {
  it("builds a prompt without coordinates", () => {
    const message = buildChatRankingUserMessage("scenic", [
      {
        key: "Rang panoramique|secondary|paved",
        roadName: "Rang panoramique",
        roadClass: "secondary",
        surface: "paved",
        text: "scenic",
      },
    ]);
    expect(message).toContain("QUERY:");
    expect(message).toContain("KINDS:");
    expect(message).not.toMatch(/latitude|longitude/i);
  });

  it("extracts JSON wrapped in markdown fences", () => {
    expect(parseJsonObjectContent('```json\n{"ranked":[]}\n```')).toEqual({
      ranked: [],
    });
  });
});
