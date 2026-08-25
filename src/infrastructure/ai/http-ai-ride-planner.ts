import { z } from "zod";
import { parseJsonObjectContent } from "@/infrastructure/routing/rag/chatgpt-corridor-retriever";
import type { ChatCompletionsClient } from "@/infrastructure/routing/rag/chat-completions-client";
import { DEFAULT_OPENAI_MODEL } from "@/infrastructure/routing/rag/chat-completions-client";
import {
  AI_UNAVAILABLE_MESSAGE,
  AiRidePlannerError,
} from "./ai-ride-planner-error";
import type {
  AiRidePlan,
  AiRidePlanInput,
  AiRidePlanner,
} from "./ai-ride-planner";

export const AI_RIDE_PLAN_QUERY_HEADER = "DESCRIBE_LOOP_PLAN:";

const planSchema = z.object({
  viaPoints: z
    .array(
      z.object({
        latitude: z.number().gte(-90).lte(90),
        longitude: z.number().gte(-180).lte(180),
      }),
    )
    .min(2)
    .max(8),
  roads: z.array(z.string()).optional(),
  pointsOfInterest: z.array(z.string()).optional(),
});

const SYSTEM_PROMPT =
  "You plan motorcycle loop via-points from web search notes. " +
  "Return JSON {\"viaPoints\":[{\"latitude\":number,\"longitude\":number}]," +
  "\"roads\":[string],\"pointsOfInterest\":[string]}. " +
  "Select 3 to 6 via-points on real roads around the origin so a road-network " +
  "router can close a loop near the requested distance. " +
  "Do not emit a route geometry, GeoJSON, or encoded polyline. " +
  "Prefer scenic or twisty public roads. Honor avoid-highway and paved-only " +
  "preferences. Skip private, closed, or inaccessible roads mentioned in the notes. " +
  "If a previous signature is provided, pick a clearly different corridor.";

export class HttpAiRidePlanner implements AiRidePlanner {
  private readonly client: ChatCompletionsClient;
  private readonly model: string;

  constructor(options: { client: ChatCompletionsClient; model?: string }) {
    this.client = options.client;
    this.model = options.model ?? DEFAULT_OPENAI_MODEL;
  }

  async planLoop(input: AiRidePlanInput): Promise<AiRidePlan> {
    try {
      const content = await this.client.complete({
        model: this.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildAiRidePlanUserMessage(input) },
        ],
        temperature: 0.4,
        response_format: { type: "json_object" },
      });
      return parseAiRidePlan(content);
    } catch (error) {
      if (error instanceof AiRidePlannerError) {
        throw error;
      }
      throw new AiRidePlannerError(AI_UNAVAILABLE_MESSAGE);
    }
  }
}

export function buildAiRidePlanUserMessage(input: AiRidePlanInput): string {
  return `${AI_RIDE_PLAN_QUERY_HEADER}\n${JSON.stringify({
    origin: {
      latitude: input.origin.latitude,
      longitude: input.origin.longitude,
      accuracyMeters: input.accuracyMeters,
    },
    targetDistanceKm: input.targetDistanceKm,
    style: input.style ?? "scenic",
    preferences: input.preferences ?? {
      avoidHighways: true,
      avoidUnpaved: true,
    },
    previousRouteSignature: input.previousRouteSignature ?? null,
    searchHits: input.searchHits,
  })}`;
}

export function parseAiRidePlan(content: string): AiRidePlan {
  let parsed: unknown;
  try {
    parsed = parseJsonObjectContent(content);
  } catch {
    throw new AiRidePlannerError(AI_UNAVAILABLE_MESSAGE);
  }
  const result = planSchema.safeParse(parsed);
  if (!result.success) {
    throw new AiRidePlannerError(AI_UNAVAILABLE_MESSAGE);
  }
  return {
    viaPoints: result.data.viaPoints,
    roads: result.data.roads ?? [],
    pointsOfInterest: result.data.pointsOfInterest ?? [],
  };
}
