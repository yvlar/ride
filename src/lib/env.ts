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
  WEB_SEARCH_PROVIDER: z.preprocess(
    emptyToUndefined,
    z.enum(["tavily", "brave", "openai"]).optional(),
  ),
  WEB_SEARCH_API_KEY: optionalSecret,
  WEB_SEARCH_API_BASE_URL: optionalUrl,
  SUPABASE_URL: optionalUrl,
  SUPABASE_ANON_KEY: optionalSecret,
  NEXT_PUBLIC_MAP_STYLE_URL: optionalUrl,
  /**
   * FR-043 — la météo par défaut est le fournisseur réel : une prévision
   * inventée enverrait un pilote sous l'orage. Le mock est explicite.
   */
  WEATHER_PROVIDER: z.preprocess(
    emptyToUndefined,
    z.enum(["open-meteo", "mock"]).default("open-meteo"),
  ),
  WEATHER_API_BASE_URL: optionalUrl,
});

export type AppEnv = z.infer<typeof envSchema>;

/**
 * Next.js only includes server env vars that are read as `process.env.NAME`.
 * Passing the `process.env` object through does not expose Vercel secrets.
 */
export function serverProcessEnv(): Record<string, string | undefined> {
  return {
    ROUTING_PROVIDER: process.env.ROUTING_PROVIDER,
    ROUTING_API_BASE_URL: process.env.ROUTING_API_BASE_URL,
    ROUTING_API_KEY: process.env.ROUTING_API_KEY,
    GEOCODING_PROVIDER: process.env.GEOCODING_PROVIDER,
    GEOCODING_API_BASE_URL: process.env.GEOCODING_API_BASE_URL,
    GEOCODING_API_KEY: process.env.GEOCODING_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_API_BASE_URL: process.env.OPENAI_API_BASE_URL,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    WEB_SEARCH_PROVIDER: process.env.WEB_SEARCH_PROVIDER,
    WEB_SEARCH_API_KEY: process.env.WEB_SEARCH_API_KEY,
    WEB_SEARCH_API_BASE_URL: process.env.WEB_SEARCH_API_BASE_URL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    NEXT_PUBLIC_MAP_STYLE_URL: process.env.NEXT_PUBLIC_MAP_STYLE_URL,
    WEATHER_PROVIDER: process.env.WEATHER_PROVIDER,
    WEATHER_API_BASE_URL: process.env.WEATHER_API_BASE_URL,
  };
}

export function parseEnv(
  source: Record<string, string | undefined> = serverProcessEnv(),
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
    WEB_SEARCH_PROVIDER: source.WEB_SEARCH_PROVIDER,
    WEB_SEARCH_API_KEY: source.WEB_SEARCH_API_KEY,
    WEB_SEARCH_API_BASE_URL: source.WEB_SEARCH_API_BASE_URL,
    SUPABASE_URL: source.SUPABASE_URL,
    SUPABASE_ANON_KEY: source.SUPABASE_ANON_KEY,
    NEXT_PUBLIC_MAP_STYLE_URL: source.NEXT_PUBLIC_MAP_STYLE_URL,
    WEATHER_PROVIDER: source.WEATHER_PROVIDER,
    WEATHER_API_BASE_URL: source.WEATHER_API_BASE_URL,
  });
}
