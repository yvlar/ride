import { z } from "zod";
import {
  isVercelAiGatewayBaseUrl,
  resolveChatCompletionsBaseUrl,
  DEFAULT_OPENAI_MODEL,
  type ChatCompletionsClient,
} from "@/infrastructure/routing/rag/chat-completions-client";
import { parseJsonObjectContent } from "@/infrastructure/routing/rag/chatgpt-corridor-retriever";
import type { AiRouteCandidate, AiWaypoint } from "@/domain/ride/ai-route";
import { AI_LOOP_MAX_REPEATED_ROAD_PERCENT } from "@/domain/ride/constants";
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
export const PROPOSE_RIDE_CANDIDATES_TOOL = "propose_ride_candidates";

const waypointSchema = z.object({
  label: z.string().min(1).optional(),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  sourceResultIds: z.array(z.string()).optional(),
});

const candidateSchema = z.object({
  candidateName: z.string().min(1).optional(),
  viaPoints: z.array(waypointSchema).min(1).max(8),
  roads: z.array(z.string()).optional(),
  pointsOfInterest: z.array(z.string()).optional(),
});

const planSchema = z.object({
  candidates: z.array(candidateSchema).min(1).max(4).optional(),
  viaPoints: z.array(waypointSchema).min(1).max(8).optional(),
  roads: z.array(z.string()).optional(),
  pointsOfInterest: z.array(z.string()).optional(),
});

const LOOP_SYSTEM_PROMPT =
  "You plan motorcycle loop corridors from web search notes. " +
  "Call propose_ride_candidates with 3 or 4 distinct JSON candidates. " +
  "Each candidate is {\"candidateName\":string,\"viaPoints\":[{\"label\":string," +
  "\"latitude\":number,\"longitude\":number,\"sourceResultIds\":[string]}]," +
  "\"roads\":[string],\"pointsOfInterest\":[string]}. " +
  "Use latitude/longitude, never GeoJSON position arrays. " +
  "Each candidate MUST use at least two named roads, villages or points of " +
  "interest supported by the web notes and cite their sourceResultIds. " +
  "Return viaPoints already in riding order around one elongated corridor so " +
  "the farthest road-network point is at least 20% of targetDistanceKm from " +
  "the origin and the routed loop is within ±10%. " +
  "Place at least three via-points in distinct compass directions from the origin " +
  "so the return cannot reuse the outbound numbered road. " +
  "Avoid zigzags that recross the same corridor. " +
  "Do not keep the ride concentrated near the origin. " +
  "Do not retrace the outbound roads on the return except a short connector " +
  "within 1 km of the origin. " +
  "Do not emit a route geometry, GeoJSON, or encoded polyline. " +
  "Paved-only and stay-in-Canada are hard constraints. Prefer avoiding " +
  "motorways; numbered trunk roads may be used when needed to close a valid loop. " +
  "Skip private, closed, or inaccessible roads. " +
  "If previousPlanningFailure is set, correct that JSON failure. " +
  "If previous roads were tried, pick unused named roads.";

const ONE_WAY_SYSTEM_PROMPT =
  "You plan motorcycle one-way corridors from web search notes. " +
  "Call propose_ride_candidates with 3 or 4 distinct JSON candidates. " +
  "Each candidate is {\"candidateName\":string,\"viaPoints\":[{\"label\":string," +
  "\"latitude\":number,\"longitude\":number,\"sourceResultIds\":[string]}]," +
  "\"roads\":[string],\"pointsOfInterest\":[string]}. " +
  "Use latitude/longitude, never GeoJSON position arrays. " +
  "The last via-point is the arrival. Do not return to the origin. " +
  "Each candidate MUST use at least two named roads, villages or points of " +
  "interest supported by the web notes when notes exist. " +
  "Return viaPoints already in riding order. " +
  "Avoid zigzags that recross the same corridor. " +
  "Do not emit a route geometry, GeoJSON, or encoded polyline. " +
  "Paved-only and stay-in-Canada are hard constraints. Prefer avoiding " +
  "motorways; numbered trunk roads may be used when needed to close a valid loop. " +
  "If previousPlanningFailure is set, correct that JSON failure.";

export const RIDE_CANDIDATES_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidateName", "viaPoints", "roads", "pointsOfInterest"],
        properties: {
          candidateName: { type: "string" },
          viaPoints: {
            type: "array",
            minItems: 2,
            maxItems: 8,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "latitude", "longitude", "sourceResultIds"],
              properties: {
                label: { type: "string" },
                latitude: { type: "number" },
                longitude: { type: "number" },
                sourceResultIds: {
                  type: "array",
                  items: { type: "string" },
                },
              },
            },
          },
          roads: { type: "array", items: { type: "string" } },
          pointsOfInterest: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

type FetchLike = typeof fetch;

export class HttpAiRidePlanner implements AiRidePlanner {
  private readonly client?: ChatCompletionsClient;
  private readonly apiKey?: string;
  private readonly baseUrl?: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetcher: FetchLike;

  constructor(options: {
    client?: ChatCompletionsClient;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    timeoutMs?: number;
    fetcher?: FetchLike;
  }) {
    this.client = options.client;
    this.apiKey = options.apiKey?.trim();
    this.baseUrl = options.baseUrl?.replace(/\/+$/, "");
    this.model = options.model ?? DEFAULT_OPENAI_MODEL;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.fetcher = options.fetcher ?? fetch;
  }

  async planLoop(input: AiRidePlanInput): Promise<AiRidePlan> {
    try {
      if (this.shouldUseResponses()) {
        return await this.planViaResponses(input);
      }
      return await this.planViaChatCompletions(input);
    } catch (error) {
      if (error instanceof AiRidePlannerError) {
        throw error;
      }
      throw new AiRidePlannerError(AI_UNAVAILABLE_MESSAGE);
    }
  }

  private shouldUseResponses(): boolean {
    if (!this.apiKey || !this.baseUrl) {
      return false;
    }
    return !isVercelAiGatewayBaseUrl(this.baseUrl);
  }

  private async planViaChatCompletions(
    input: AiRidePlanInput,
  ): Promise<AiRidePlan> {
    if (!this.client) {
      throw new AiRidePlannerError(AI_UNAVAILABLE_MESSAGE);
    }
    const content = await this.client.complete({
      model: this.model,
      messages: [
        {
          role: "system",
          content: systemPromptFor(input.returnToStart !== false),
        },
        { role: "user", content: buildAiRidePlanUserMessage(input) },
      ],
      temperature: input.previousPlanningFailure ? 0.8 : 0.4,
      response_format: { type: "json_object" },
    });
    return parseAiRidePlan(content);
  }

  private async planViaResponses(input: AiRidePlanInput): Promise<AiRidePlan> {
    const hasSearchHits = input.searchHits.length > 0;
    const tools = [
      ...(hasSearchHits
        ? []
        : [{ type: "web_search", search_context_size: "medium" }]),
      {
        type: "function",
        name: PROPOSE_RIDE_CANDIDATES_TOOL,
        description:
          "Propose 3 or 4 motorcycle corridor candidates as strict JSON.",
        strict: true,
        parameters: RIDE_CANDIDATES_JSON_SCHEMA,
      },
    ];
    const conversation = [
      {
        role: "developer",
        content: systemPromptFor(input.returnToStart !== false),
      },
      { role: "user", content: buildAiRidePlanUserMessage(input) },
    ];
    const first = await this.requestResponses({
      model: this.model,
      tools,
      tool_choice: hasSearchHits
        ? { type: "function", name: PROPOSE_RIDE_CANDIDATES_TOOL }
        : "auto",
      input: conversation,
    });
    const firstPlan = tryParseAiRidePlanFromResponses(first);
    if (firstPlan) {
      return firstPlan;
    }
    const output = responsesOutput(first);
    const second = await this.requestResponses({
      model: this.model,
      tools,
      tool_choice: {
        type: "function",
        name: PROPOSE_RIDE_CANDIDATES_TOOL,
      },
      input: [
        ...conversation,
        ...output,
        {
          role: "user",
          content:
            "Call propose_ride_candidates now with 3 or 4 distinct JSON candidates grounded in the web results.",
        },
      ],
    });
    return parseAiRidePlanFromResponses(second);
  }

  private async requestResponses(body: unknown): Promise<unknown> {
    if (!this.apiKey || !this.baseUrl) {
      throw new AiRidePlannerError(AI_UNAVAILABLE_MESSAGE);
    }
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new AiRidePlannerError(AI_UNAVAILABLE_MESSAGE);
    }
    const payload = await readJson(response);
    if (!response.ok) {
      console.error("[ride] AI ride plan failed", { status: response.status });
      throw new AiRidePlannerError(AI_UNAVAILABLE_MESSAGE);
    }
    return payload;
  }
}

function systemPromptFor(returnToStart: boolean): string {
  return returnToStart ? LOOP_SYSTEM_PROMPT : ONE_WAY_SYSTEM_PROMPT;
}

export function buildAiRidePlanUserMessage(input: AiRidePlanInput): string {
  const returnToStart = input.returnToStart !== false;
  const candidateCount = input.candidateCount ?? 4;
  const minimumOuterRadiusKm = Number(
    (input.targetDistanceKm * 0.2).toFixed(1),
  );
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
    returnToStart,
    previousPlanningFailure: input.previousPlanningFailure ?? null,
    triedRoads: input.triedRoads ?? [],
    searchRadiusKm: input.searchRadiusKm ?? null,
    corridorHint: input.corridorHint ?? null,
    planningBounds: {
      candidateCount,
      minimumOuterRadiusKm,
      distanceTolerancePercent: 10,
      maximumRepeatedRoadPercent: AI_LOOP_MAX_REPEATED_ROAD_PERCENT,
      orderedTravelSequenceRequired: true,
      coordinateOrder: "latitude_longitude",
      geoJsonOrder: "longitude_latitude",
    },
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
  return planFromUnknown(parsed);
}

export function parseAiRidePlanFromResponses(payload: unknown): AiRidePlan {
  const plan = tryParseAiRidePlanFromResponses(payload);
  if (!plan) {
    throw new AiRidePlannerError(AI_UNAVAILABLE_MESSAGE);
  }
  return plan;
}

function tryParseAiRidePlanFromResponses(
  payload: unknown,
): AiRidePlan | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const record = payload as {
    output?: unknown[];
    output_text?: string;
  };
  const fromTool = planFromFunctionCalls(record.output ?? []);
  if (fromTool) {
    return fromTool;
  }
  if (record.output_text?.trim()) {
    try {
      return parseAiRidePlan(record.output_text);
    } catch {
      return undefined;
    }
  }
  const text = collectOutputText(record.output ?? []);
  if (!text.trim()) {
    return undefined;
  }
  try {
    return parseAiRidePlan(text);
  } catch {
    return undefined;
  }
}

function responsesOutput(payload: unknown): unknown[] {
  if (typeof payload !== "object" || payload === null) {
    return [];
  }
  const output = (payload as { output?: unknown }).output;
  return Array.isArray(output) ? output : [];
}

function planFromFunctionCalls(output: unknown[]): AiRidePlan | undefined {
  for (const item of output) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const record = item as {
      type?: unknown;
      name?: unknown;
      arguments?: unknown;
    };
    if (
      (record.type === "function_call" || record.type === "tool_call") &&
      record.name === PROPOSE_RIDE_CANDIDATES_TOOL
    ) {
      if (typeof record.arguments === "string") {
        return parseAiRidePlan(record.arguments);
      }
      if (typeof record.arguments === "object" && record.arguments !== null) {
        return planFromUnknown(record.arguments);
      }
    }
  }
  return undefined;
}

function collectOutputText(output: unknown[]): string {
  const parts: string[] = [];
  for (const item of output) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const block of content) {
      if (typeof block !== "object" || block === null) {
        continue;
      }
      const text = (block as { text?: unknown }).text;
      if (typeof text === "string") {
        parts.push(text);
      }
    }
  }
  return parts.join("\n");
}

function planFromUnknown(parsed: unknown): AiRidePlan {
  const result = planSchema.safeParse(parsed);
  if (!result.success) {
    throw new AiRidePlannerError(AI_UNAVAILABLE_MESSAGE);
  }
  const candidates = (result.data.candidates ?? []).map((candidate, index) =>
    normalizeCandidate(candidate, index),
  );
  if (candidates.length > 0) {
    return { candidates };
  }
  const viaPoints = result.data.viaPoints ?? [];
  if (viaPoints.length === 0) {
    throw new AiRidePlannerError(AI_UNAVAILABLE_MESSAGE);
  }
  return {
    candidates: [
      normalizeCandidate(
        {
          candidateName: "planned",
          viaPoints,
          roads: result.data.roads,
          pointsOfInterest: result.data.pointsOfInterest,
        },
        0,
      ),
    ],
  };
}

function normalizeCandidate(
  candidate: z.infer<typeof candidateSchema>,
  index: number,
): AiRouteCandidate {
  return {
    candidateName: candidate.candidateName?.trim() || `candidate-${index + 1}`,
    viaPoints: candidate.viaPoints.map(normalizeWaypoint),
    roads: candidate.roads ?? [],
    pointsOfInterest: candidate.pointsOfInterest ?? [],
  };
}

function normalizeWaypoint(
  point: z.infer<typeof waypointSchema>,
): AiWaypoint {
  return {
    label: point.label?.trim() || "via",
    latitude: point.latitude,
    longitude: point.longitude,
    sourceResultIds: point.sourceResultIds ?? [],
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AiRidePlannerError(AI_UNAVAILABLE_MESSAGE);
  }
}

export function resolvePlannerBaseUrl(options: {
  apiKey: string;
  baseUrl?: string;
}): string {
  return resolveChatCompletionsBaseUrl(options);
}
