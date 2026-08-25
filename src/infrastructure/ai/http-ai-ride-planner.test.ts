import { describe, expect, it, vi } from "vitest";
import type { ChatCompletionsClient } from "@/infrastructure/routing/rag/chat-completions-client";
import {
  AI_RIDE_PLAN_QUERY_HEADER,
  buildAiRidePlanUserMessage,
  HttpAiRidePlanner,
  parseAiRidePlan,
  parseAiRidePlanFromResponses,
  PROPOSE_RIDE_CANDIDATES_TOOL,
} from "./http-ai-ride-planner";
import { AiRidePlannerError } from "./ai-ride-planner-error";

const ORIGIN = { latitude: 45.4, longitude: -72.73 };

const LOOP_CANDIDATES = {
  candidates: [
    {
      candidateName: "Orford",
      viaPoints: [
        {
          label: "Chemin du Mont-Orford",
          latitude: 45.5,
          longitude: -72.73,
          sourceResultIds: ["web-1"],
        },
        {
          label: "Parc national du Mont-Orford",
          latitude: 45.4,
          longitude: -72.6,
          sourceResultIds: ["web-2"],
        },
        {
          label: "Eastman",
          latitude: 45.3,
          longitude: -72.73,
          sourceResultIds: ["web-1"],
        },
      ],
      roads: ["Chemin du Mont-Orford"],
      pointsOfInterest: ["Parc national du Mont-Orford"],
    },
  ],
};

describe("HttpAiRidePlanner (FR-034)", () => {
  it("asks the model for structured via-points, not geometry", async () => {
    const complete = vi.fn<ChatCompletionsClient["complete"]>(async () =>
      JSON.stringify(LOOP_CANDIDATES),
    );
    const planner = new HttpAiRidePlanner({
      client: { complete },
    });

    const plan = await planner.planLoop({
      origin: ORIGIN,
      accuracyMeters: 8,
      targetDistanceKm: 100,
      searchHits: [
        {
          id: "web-1",
          title: "Orford loop",
          snippet: "Scenic twisty roads.",
        },
      ],
    });

    expect(plan.candidates[0]?.viaPoints).toHaveLength(3);
    expect(plan.candidates[0]?.viaPoints[0]).toMatchObject({
      latitude: 45.5,
      longitude: -72.73,
    });
    expect(complete).toHaveBeenCalledTimes(1);
    const request = complete.mock.calls[0]?.[0];
    expect(request?.messages[1]?.content).toContain(AI_RIDE_PLAN_QUERY_HEADER);
    expect(request?.messages[1]?.content).toContain("45.4");
    expect(request?.messages[1]?.content).not.toMatch(/"type":"LineString"/);
    expect(request?.messages[0]?.content).toMatch(/Do not emit a route geometry/);
    expect(request?.messages[0]?.content).toMatch(/supported by the web notes/);
    expect(request?.messages[0]?.content).toMatch(/already in riding order/);
    expect(request?.messages[0]?.content).toMatch(/Avoid zigzags/);
  });

  it("rejects a model reply that is not structured via-points", () => {
    expect(() => parseAiRidePlan('{"geometry":[]}')).toThrow(AiRidePlannerError);
  });

  it("accepts a legacy single viaPoints object as one candidate", () => {
    const plan = parseAiRidePlan(
      JSON.stringify({
        viaPoints: [
          { latitude: 45.5, longitude: -72.73 },
          { latitude: 45.3, longitude: -72.6 },
        ],
      }),
    );
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0]?.viaPoints).toHaveLength(2);
  });

  it("includes origin, distance, accuracy and previous signature in the prompt", () => {
    const message = buildAiRidePlanUserMessage({
      origin: ORIGIN,
      accuracyMeters: 12,
      targetDistanceKm: 180,
      previousRouteSignature: "route-1:3:abc",
      searchHits: [],
    });
    expect(message).toMatch(/180/);
    expect(message).toMatch(/12/);
    expect(message).toMatch(/route-1:3:abc/);
    expect(message).toMatch(/"minimumOuterRadiusKm":36/);
    expect(message).toMatch(/"orderedTravelSequenceRequired":true/);
    expect(message).toMatch(/"coordinateOrder":"latitude_longitude"/);
    expect(message).toMatch(/"geoJsonOrder":"longitude_latitude"/);
  });

  it("asks for a one-way arrival when returnToStart is false (FR-034)", async () => {
    const complete = vi.fn<ChatCompletionsClient["complete"]>(async () =>
      JSON.stringify({
        candidates: [
          {
            candidateName: "east",
            viaPoints: [
              { latitude: 45.45, longitude: -72.6, label: "via" },
              { latitude: 45.5, longitude: -72.5, label: "arrival" },
            ],
          },
        ],
      }),
    );
    const planner = new HttpAiRidePlanner({ client: { complete } });
    await planner.planLoop({
      origin: ORIGIN,
      accuracyMeters: 8,
      targetDistanceKm: 80,
      returnToStart: false,
      searchHits: [],
    });
    expect(complete.mock.calls[0]?.[0].messages[0]?.content).toMatch(
      /Do not return to the origin/,
    );
    expect(buildAiRidePlanUserMessage({
      origin: ORIGIN,
      accuracyMeters: null,
      targetDistanceKm: 80,
      returnToStart: false,
      searchHits: [],
    })).toMatch(/"returnToStart":false/);
  });

  it("asks the model to correct a previous planning failure (FR-034)", async () => {
    const complete = vi.fn<ChatCompletionsClient["complete"]>(async () =>
      JSON.stringify(LOOP_CANDIDATES),
    );
    const planner = new HttpAiRidePlanner({ client: { complete } });
    await planner.planLoop({
      origin: ORIGIN,
      accuracyMeters: 8,
      targetDistanceKm: 80,
      searchHits: [],
      previousPlanningFailure: {
        reason: "unusable_via_points",
        instruction:
          "Replace unroutable coordinates with named public-road anchors from the web results.",
      },
    });
    const request = complete.mock.calls[0]?.[0];
    expect(request?.temperature).toBe(0.8);
    expect(request?.messages[1]?.content).toMatch(/unusable_via_points/);
    expect(request?.messages[0]?.content).toMatch(/previousPlanningFailure/);
  });

  it("uses Responses web_search and a strict function to propose candidates", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          output: [
            { type: "web_search_call", status: "completed" },
            {
              type: "function_call",
              name: PROPOSE_RIDE_CANDIDATES_TOOL,
              arguments: JSON.stringify(LOOP_CANDIDATES),
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const planner = new HttpAiRidePlanner({
      apiKey: "sk-test",
      baseUrl: "https://api.openai.com/v1",
      fetcher,
    });

    const plan = await planner.planLoop({
      origin: ORIGIN,
      accuracyMeters: 8,
      targetDistanceKm: 100,
      searchHits: [
        { id: "web-1", title: "Orford loop", snippet: "Scenic twisty roads." },
      ],
    });

    expect(plan.candidates).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [, init] = fetcher.mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body)) as {
      tools: Array<{ type?: string; name?: string; strict?: boolean }>;
    };
    expect(body.tools.some((tool) => tool.type === "web_search")).toBe(true);
    expect(
      body.tools.some(
        (tool) =>
          tool.name === PROPOSE_RIDE_CANDIDATES_TOOL && tool.strict === true,
      ),
    ).toBe(true);
  });

  it("asks for candidates after a Responses turn that only searched", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        tool_choice?: unknown;
      };
      if (body.tool_choice === "auto") {
        return new Response(
          JSON.stringify({
            output: [{ type: "web_search_call", status: "completed" }],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          output: [
            {
              type: "function_call",
              name: PROPOSE_RIDE_CANDIDATES_TOOL,
              arguments: JSON.stringify(LOOP_CANDIDATES),
            },
          ],
        }),
        { status: 200 },
      );
    });
    const planner = new HttpAiRidePlanner({
      apiKey: "sk-test",
      baseUrl: "https://api.openai.com/v1",
      fetcher,
    });

    const plan = await planner.planLoop({
      origin: ORIGIN,
      accuracyMeters: null,
      targetDistanceKm: 80,
      searchHits: [],
    });

    expect(plan.candidates[0]?.candidateName).toBe("Orford");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("parses function_call arguments from a Responses payload", () => {
    const plan = parseAiRidePlanFromResponses({
      output: [
        {
          type: "function_call",
          name: PROPOSE_RIDE_CANDIDATES_TOOL,
          arguments: JSON.stringify(LOOP_CANDIDATES),
        },
      ],
    });
    expect(plan.candidates[0]?.roads).toEqual(["Chemin du Mont-Orford"]);
  });
});
