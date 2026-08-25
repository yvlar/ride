import { describe, expect, it, vi } from "vitest";
import type { ChatCompletionsClient } from "@/infrastructure/routing/rag/chat-completions-client";
import {
  AI_RIDE_PLAN_QUERY_HEADER,
  buildAiRidePlanUserMessage,
  HttpAiRidePlanner,
  parseAiRidePlan,
} from "./http-ai-ride-planner";
import { AiRidePlannerError } from "./ai-ride-planner-error";

const ORIGIN = { latitude: 45.4, longitude: -72.73 };

describe("HttpAiRidePlanner (FR-034)", () => {
  it("asks the model for structured via-points, not geometry", async () => {
    const complete = vi.fn<ChatCompletionsClient["complete"]>(async () =>
      JSON.stringify({
        viaPoints: [
          { latitude: 45.5, longitude: -72.73 },
          { latitude: 45.4, longitude: -72.6 },
          { latitude: 45.3, longitude: -72.73 },
        ],
        roads: ["Chemin du Mont-Orford"],
        pointsOfInterest: ["Parc national du Mont-Orford"],
      }),
    );
    const planner = new HttpAiRidePlanner({
      client: { complete },
    });

    const plan = await planner.planLoop({
      origin: ORIGIN,
      accuracyMeters: 8,
      targetDistanceKm: 100,
      searchHits: [{ title: "Orford loop", snippet: "Scenic twisty roads." }],
    });

    expect(plan.viaPoints).toHaveLength(3);
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
    expect(message).toMatch(/"maximumWaypointRadiusKm":99/);
    expect(message).toMatch(/"orderedTravelSequenceRequired":true/);
  });

  it("asks for a one-way arrival when returnToStart is false (FR-034)", async () => {
    const complete = vi.fn<ChatCompletionsClient["complete"]>(async () =>
      JSON.stringify({
        viaPoints: [
          { latitude: 45.45, longitude: -72.6 },
          { latitude: 45.5, longitude: -72.5 },
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
});
