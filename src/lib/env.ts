import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  value === "" || value === undefined ? undefined : value;

const optionalUrl = z.preprocess(
  emptyToUndefined,
  z.string().url().optional(),
);

const optionalSecret = z.preprocess(
  emptyToUndefined,
  z.string().min(1).optional(),
);

export const envSchema = z.object({
  ROUTING_PROVIDER: z.preprocess(
    emptyToUndefined,
    z.enum(["mock", "ai-rag", "graphhopper", "valhalla", "osrm"]).default(
      "mock",
    ),
  ),
  ROUTING_API_BASE_URL: optionalUrl,
  ROUTING_API_KEY: optionalSecret,
  GEOCODING_PROVIDER: z.preprocess(
    emptyToUndefined,
    z.enum(["mock", "nominatim"]).default("mock"),
  ),
  GEOCODING_API_BASE_URL: optionalUrl,
  GEOCODING_API_KEY: optionalSecret,
  OPENAI_API_KEY: optionalSecret,
  OPENAI_API_BASE_URL: optionalUrl,
  OPENAI_MODEL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  NEXT_PUBLIC_MAP_STYLE_URL: optionalUrl,
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(
  source: Record<string, string | undefined> = process.env,
): AppEnv {
  return envSchema.parse({
    ROUTING_PROVIDER: source.ROUTING_PROVIDER,
    ROUTING_API_BASE_URL: source.ROUTING_API_BASE_URL,
    ROUTING_API_KEY: source.ROUTING_API_KEY,
    GEOCODING_PROVIDER: source.GEOCODING_PROVIDER,
    GEOCODING_API_BASE_URL: source.GEOCODING_API_BASE_URL,
    GEOCODING_API_KEY: source.GEOCODING_API_KEY,
    OPENAI_API_KEY: source.OPENAI_API_KEY,
    OPENAI_API_BASE_URL: source.OPENAI_API_BASE_URL,
    OPENAI_MODEL: source.OPENAI_MODEL,
    NEXT_PUBLIC_MAP_STYLE_URL: source.NEXT_PUBLIC_MAP_STYLE_URL,
  });
}
